import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  SafeAreaView,
  InteractionManager,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateProject, getAllProjects } from '../../utils/projectStorage'; 
import { interpolateKeyframesSpline } from '../../utils/interpolateKeyframesSpline';
import TrimSlider from '../../components/TrimSlider'; 
import { saveTrimInfo, loadTrimInfo } from '../../utils/trimStorage';
import { saveToPersistentStorage } from '../../utils/fileStorage';
import { colors } from '../../theme/theme';
import ClipNavigation from '../../navigation/ClipNavigation';
import RNFS from 'react-native-fs';
import VideoEditorNativeModule from '../../nativemodules/VideoEditorNativeModule';
import Animated, { useSharedValue } from 'react-native-reanimated';
import VideoPlaybackCanvas from '../../components/VideoPlaybackCanvas';
import { trackingCallbackRef } from '../../utils/trackingCallbackRegistry';

const defaultCategories = [
  'Goal',
  'Assist',
  'Defense',
  'Skill',
  'Save',
  'Key Pass',
  'Other / Create New',
];

const CUSTOM_CATEGORIES_KEY = 'CUSTOM_CATEGORIES';

const frameWidth = 1080;
const frameHeight = 1920;

function uriToPath(uri) {
  return uri.startsWith('file://') ? uri.replace('file://', '') : uri;
}

const ASPECT_RATIOS = {
  PORTRAIT: { label: 'Portrait (9:16)', width: 1080, height: 1920, ratio: 9 / 16 },
  LANDSCAPE: { label: 'Landscape (16:9)', width: 1920, height: 1080, ratio: 16 / 9 },
  SQUARE: { label: 'Square (1:1)', width: 1080, height: 1080, ratio: 1 },
};

export default function VideoEditorScreen({ route, navigation }) {
  const { project, onClipUpdate, currentClip: routeCurrentClip} = route.params ?? {};
  
  const [keyframes, setKeyframes] = useState([]);
  const videoRef = useRef(null);
  const [markerPos, setMarkerPos] = useState({ x: 0.5, y: 0.5 });

  const [clips, setClips] = useState(project?.clips ?? []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [trackingEnabled, setTrackingEnabled] = useState(false);

  const [customCategories, setCustomCategories] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const currentClip = clips[currentIndex] ?? null;
  
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [paused, setPaused] = useState(true);
  const [loopTrimPreview, setLoopTrimPreview] = useState(true);

  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const [batchExportProgress, setBatchExportProgress] = useState({ current: 0, total: 0 });

  const projectId = project?.id;
  const clipId = currentClip?.id || currentClip?.uri;
  const hasSmartZoom = !!currentClip.smartZoomKeyframes?.length;//= clips[currentIndex]?.smartZoomKeyframes != null;
  const hasObjectTracking = Array.isArray(currentClip?.markerKeyframes) && currentClip.markerKeyframes.length > 0;
  const [safeUri, setSafeUri] = useState(null);
  const [aspectRatio, setAspectRatio] = useState(project?.aspectRatio ?? ASPECT_RATIOS.PORTRAIT);
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const currentTimeShared = useSharedValue(trimStart);
  const videoLayoutShared = useSharedValue(null);
  const videoNaturalWidthShared = useSharedValue(null);
  const videoNaturalHeightShared = useSharedValue(null);
  const isPreview = useSharedValue(true);
  const trackingCallbackRef = useRef(null);

  let containerWidth, containerHeight;

  if (aspectRatio.ratio < 1) {
    // Portrait mode: fix height, calculate width
    containerHeight = Math.min(screenHeight * 0.4, 400); // max 400px or 40% screen
    containerWidth = containerHeight * aspectRatio.ratio;
  } else {
    // Landscape or Square: fix width, calculate height
    containerWidth = screenWidth * 0.9;
    containerHeight = containerWidth / aspectRatio.ratio;
  }

  useEffect(() => {
    currentTimeShared.value = currentTime;
  }, [currentTime]);

  // Check if clip file exists on disk and persist it if needed
  useEffect(() => {
    const checkClipFile = async () => {
      if (!currentClip?.uri) return;

      const path = currentClip.uri.replace('file://', '');
      const exists = await RNFS.exists(path);

      if (!exists) {
        console.warn('Clip file missing on disk:', currentClip.uri);
        // Optional: alert the user or remove the broken clip from UI
        return;
      }

      // Try to persist it if needed
      try {
        const storedUri = await saveToPersistentStorage(currentClip.uri, project);
        
        if (!storedUri || !(await RNFS.exists(storedUri.replace('file://', '')))) {
          console.warn('Clip could not be re-persisted:', currentClip.uri);
          return;
        }

        if (storedUri !== currentClip.uri) {
          const updated = [...clips];
          updated[currentIndex].uri = storedUri;
          setClips(updated);
        }
      } catch (err) {
        console.warn('Could not persist clip URI:', err.message);
      }
    };

    checkClipFile();
  }, [currentClip?.uri]);

  // Load trim info when project or clip changes
  useEffect(() => {
    async function fetchTrim() {
      if (projectId && clipId) {
        const savedTrim = await loadTrimInfo(projectId, clipId);
        if (duration > 0) {
          if (savedTrim && Number.isFinite(savedTrim.startTime) && Number.isFinite(savedTrim.endTime)) {
            setTrimStart(savedTrim.startTime);
            setTrimEnd(savedTrim.endTime);
          } else {
            setTrimStart(0);
            setTrimEnd(duration);
          }
        }
      }
    }
    fetchTrim();
  }, [projectId, clipId, duration]);

  // Load saved custom categories
  useEffect(() => {
    loadCustomCategories();
  }, []);

  // Seek to trimStart when it changes
  useEffect(() => {
    if (videoRef.current && trimStart < trimEnd) {
      videoRef.current.seek(trimStart);
    }
  }, [trimStart]);

  // When trimStart changes, seek to that time, but only if duration is valid
  useEffect(() => {
    if (videoRef.current && trimStart < trimEnd && duration > 0) {
      videoRef.current.seek(trimStart);
      setPaused(false); // ensure video plays after seek
    }
  }, [trimStart, trimEnd, duration]);

  useEffect(() => {
    const current = clips[currentIndex];
    if (current?.smartZoomKeyframes?.length >= 3) {
      keyframesShared.value = current.smartZoomKeyframes;
      console.log('✅ Loaded keyframes for playback:', current.smartZoomKeyframes);
    } else {
      keyframesShared.value = [];
      console.log('ℹ️ No keyframes found for current clip');
    }
  }, [currentIndex, clips]);

  // Handle updated smart zoom keyframes from SmartZoom screen 
  useEffect(() => {
    const persistSmartZoom = async () => {
      if (route.params?.updatedSmartZoom) {
        const { clipIndex, keyframes } = route.params.updatedSmartZoom;
        const updatedClips = [...clips];
        updatedClips[clipIndex] = {
          ...updatedClips[clipIndex],
          smartZoomKeyframes: keyframes,
        };
        setClips(updatedClips);

        const updatedProject = { ...project, clips: updatedClips };
        await updateProject(updatedProject);

        console.log("persistSmartZoom - keyframes",keyframes)

        if (clipIndex === currentIndex) {
          keyframesShared.value = keyframes;

          console.log("persistSmartZoom - keyframesShared.value",keyframesShared.value)
        }

        navigation.setParams({ updatedSmartZoom: null });
      }
    };
    persistSmartZoom();
  }, [route.params?.updatedSmartZoom, currentIndex]);

  // Ensure currentClip is set from route params if available
  useEffect(() => {
    let isActive = true;

    InteractionManager.runAfterInteractions(() => {
      if (isActive) {
        setSafeUri(currentClip?.uri);
      }
    });

    return () => {
      isActive = false;
      setSafeUri(null); // Clear URI on unmount or before update
    };
  }, [currentClip?.uri]);

  // Save trim info whenever trim changes
  const handleTrimChange = async (start, end) => {
    setTrimStart(start);
    setTrimEnd(end);
    setPaused(true);

    if (videoRef.current) videoRef.current.seek(start);

    // Save locally in clips array
    const updatedClips = [...clips];
    updatedClips[currentIndex] = {
      ...updatedClips[currentIndex],
      trimStart: start,
      trimEnd: end,
    };
    setClips(updatedClips);

    // Persist if needed
    if (projectId && clipId) {
      try {
        await saveTrimInfo(projectId, clipId, { startTime: start, endTime: end });
      } catch (e) {
        console.error('Failed to save trim info:', e);
      }
    }
  };

  const saveEditedClipsToProject = async () => {
    const updatedProject = { ...project, clips: clips, aspectRatio};
    await updateProject(updatedProject);
  };

  const loadCustomCategories = async () => {
    try {
      const saved = await AsyncStorage.getItem(CUSTOM_CATEGORIES_KEY);
      if (saved) {
        setCustomCategories(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load custom categories', e);
    }
  };

  const saveCustomCategories = async (categories) => {
    try {
      await AsyncStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(categories));
      setCustomCategories(categories);
    } catch (e) {
      console.error('Failed to save custom categories', e);
    }
  };

  const allCategories = [
    ...defaultCategories.slice(0, -1),
    ...customCategories,
    'Other / Create New',
  ];

  const assignCategory = (category) => {
    if (category === 'Other / Create New') {
        setNewCategoryName('');
        setModalVisible(true);
        return;
    }
    const updatedClips = [...clips];
    // Deselect if user taps the already selected category
    if (updatedClips[currentIndex].category === category) {
        updatedClips[currentIndex].category = null;
    } else {
        updatedClips[currentIndex].category = category;
    }
    setClips(updatedClips);
  };

  const addCustomCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      Alert.alert('Invalid category', 'Category name cannot be empty');
      return;
    }
    if (customCategories.includes(trimmed) || defaultCategories.includes(trimmed)) {
      Alert.alert('Duplicate category', 'This category already exists');
      return;
    }
    const updated = [...customCategories, trimmed];
    saveCustomCategories(updated);
    setModalVisible(false);
    assignCategory(trimmed);
  };

  const deleteCustomCategory = (categoryToDelete) => {
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete the category "${categoryToDelete}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const updated = customCategories.filter((cat) => cat !== categoryToDelete);
            saveCustomCategories(updated);
            setClips((prevClips) =>
              prevClips.map((clip) =>
                clip.category === categoryToDelete ? { ...clip, category: null } : clip
              )
            );
          },
        },
      ]
    );
  };

  const handleBatchExport = async () => {
    try {
      await saveEditedClipsToProject();

      // Prepare clips array with path + trim info
      const clipsToMerge = clips.map(clip => ({
        path: uriToPath(clip.uri),
        trimStart: clip.trimStart ?? 0,
        trimEnd: clip.trimEnd ?? clip.duration,
        smartZoomKeyframes: Array.isArray(clip.smartZoomKeyframes) ? clip.smartZoomKeyframes : null,
      }));

      const outputPath = `${RNFS.CachesDirectoryPath}/merged_output_${Date.now()}.mov`; // or .mp4

      const outputResolution = {
        width: aspectRatio.width,
        height: aspectRatio.height,
      };

      const mergedVideoPath = await VideoEditorNativeModule.process({
        type: 'merge',
        clips: clipsToMerge,
        outputPath,
        resolution: outputResolution, // update native module
      });

      Alert.alert('Success', 'Merged video exported to Camera Roll');

    } catch (error) {
      console.error('Batch export failed:', error);
      Alert.alert('Error', 'Failed to export merged video.');
    }
  };

  const keyframesShared = useRef(useSharedValue([])).current;
  const overlaysShared = useRef(useSharedValue(currentClip?.markerKeyframes ?? [])).current;
  const gestureModeShared = useRef(useSharedValue('zoom')).current;

  useEffect(() => {
    if (Array.isArray(currentClip?.smartZoomKeyframes)) {
      keyframesShared.value = currentClip.smartZoomKeyframes;
    }
  }, [currentClip?.smartZoomKeyframes]);

  const onLoad = (data) => {
    console.log('🎞 onLoad triggered with data:', data);

    // Extract and assign natural size
    const naturalWidth = data?.naturalSize?.width;
    const naturalHeight = data?.naturalSize?.height;

    if (Number.isFinite(naturalWidth) && Number.isFinite(naturalHeight)) {
      videoNaturalWidthShared.value = naturalWidth;
      videoNaturalHeightShared.value = naturalHeight;
      console.log('📏 Natural size:', { naturalWidth, naturalHeight });
    } else {
      console.warn('⚠️ Missing or invalid natural size. Falling back to default 1080x1920');
      videoNaturalWidthShared.value = 1080;
      videoNaturalHeightShared.value = 1920;
    }

    // Extract duration
    const loadedDuration = data?.duration;
    if (!Number.isFinite(loadedDuration) || loadedDuration <= 0) {
      console.warn('⚠️ Invalid or missing duration in onLoad:', loadedDuration);
      return;
    }

    console.log('✅ Valid duration loaded:', loadedDuration);
    setDuration(loadedDuration);
    setTrimStart(0);
    setTrimEnd(loadedDuration);
    currentTimeShared.value = 0;
    setCurrentTime(0);
    setPaused(false);
    videoRef.current?.seek(0);

    // Load trim data if available
    if (projectId && clipId) {
      loadTrimInfo(projectId, clipId).then((savedTrim) => {
        if (
          savedTrim &&
          Number.isFinite(savedTrim.startTime) &&
          Number.isFinite(savedTrim.endTime)
        ) {
          setTrimStart(savedTrim.startTime);
          setTrimEnd(savedTrim.endTime);
          currentTimeShared.value = savedTrim.startTime;
          setCurrentTime(savedTrim.startTime);
          videoRef.current?.seek(savedTrim.startTime);
        }
      });
    }
  };

  const onError = (error) => {
    console.log('Video playback error:', error);
  };

  const onProgress = (data) => {
    const current = data.currentTime;
    const effectiveTrimEnd = trimEnd > trimStart ? trimEnd : duration;

    if (current < trimStart) {
      videoRef.current?.seek(trimStart);
    } else if (current >= effectiveTrimEnd) {
      setPaused(true);
    }

    setCurrentTime(current);
    currentTimeShared.value = current;
  };

  const togglePlayPause = () => {
    // fallback to currentTime if trimEnd/duration invalid
    const effectiveTrimEnd = (trimEnd > trimStart ? trimEnd : duration) || currentTime;

    // Add a 50ms buffer to account for float imprecision
    const clipHasEnded = currentTime >= (effectiveTrimEnd - 0.05);

    if (paused && clipHasEnded) {
      const restartTime = trimStart || 0;
      videoRef.current?.seek(restartTime);
      setCurrentTime(restartTime);
      currentTimeShared.value = restartTime;
    }

    setPaused(prev => !prev);
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }; 

  const goNext = () => {
    if (currentIndex < clips.length - 1) setCurrentIndex(currentIndex + 1);
    else Alert.alert('End of clips', 'You have reviewed all clips.');
  };

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const handleSmartZoom = () => {
    console.log('[Navigate to SmartZoom]', { trimStart, trimEnd, duration });

    navigation.navigate('SmartZoom', {
      project,
      videoUri: currentClip?.uri,
      trimStart,
      trimEnd,
      duration,
      clipIndex: currentIndex,
      aspectRatio,
      existingKeyframes: currentClip?.smartZoomKeyframes ?? null,
    });
  };

  const zoomKeyframes = hasSmartZoom
    ? currentClip.smartZoomKeyframes.map(kf => ({
        time: kf.timestamp,
        x: kf.x,
        y: kf.y,
        scale: kf.scale,
      }))
    : [];

  const smartZoomTransform = hasSmartZoom
  ? interpolateKeyframesSpline(zoomKeyframes, currentTime)
  : null;

  const transformStyle = hasSmartZoom && smartZoomTransform
    ? {
        transform: [
          { scale: smartZoomTransform.scale },
          { translateX: -smartZoomTransform.x },
          { translateY: -smartZoomTransform.y },
        ],
      }
    : {};

  const handleSmartZoomEdit = () => {
    handleSmartZoom();
  };

  const handleSmartZoomReset = () => {
    const updated = [...clips];
    updated[currentIndex].smartZoomKeyframes = null;
    setClips(updated);
  };

  const handleSmartTracking = (initialMarkerKeyframes = []) => {
    trackingCallbackRef.current = (updatedKeyframes) => {
      const updated = [...clips];
      updated[currentIndex].markerKeyframes = updatedKeyframes;
      setClips(updated);
    };

    navigation.navigate('SmartTracking', {
      project,
      clip: currentClip,
      videoUri: currentClip?.uri,
      trimStart,
      trimEnd,
      duration,
      aspectRatio,
      markerKeyframes: initialMarkerKeyframes,
    });
  };

  const logVideoFileDetails = async (uri) => {
    // console.log('[SmartZoom] Attempting to load video:', uri);

    try {
      const exists = await RNFS.exists(uri);
      // console.log(`[SmartZoom] File exists: ${exists}`);

      if (exists) {
        const stat = await RNFS.stat(uri);
        // console.log(`[SmartZoom] File size: ${stat.size}`);
        // console.log(`[SmartZoom] File modified: ${stat.mtime}`);
        // console.log(`[SmartZoom] File path: ${stat.path}`);
      } else {
        console.warn('[SmartZoom] File does not exist at path:', uri);
      }
    } catch (err) {
      console.error('[SmartZoom] Error while checking file stats:', err);
    }
  };

  useEffect(() => {
    if (currentClip?.uri) {
      logVideoFileDetails(currentClip.uri);
    }
  }, [currentClip?.uri]);

return (
  <SafeAreaView style={styles.safeArea}>
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>
          {project.name} - Clip {currentIndex + 1} / {clips.length}
        </Text>

        {/* Video Player */}
        <View style={styles.videoWrapper}>
          <Animated.View
            onLayout={(e) => {
              const { width, height } = e.nativeEvent.layout;
              console.log('📏 Layout set from VideoEditorScreen:', { width, height });
              videoLayoutShared.value = {
                frameWidth: width,
                frameHeight: height,
                containerWidth: width,
                containerHeight: height,
              };
            }}
            style={[
              styles.videoContainerBase,
              {
                width: containerWidth,
                height: containerHeight,
                alignSelf: 'center',
                overflow: 'hidden',
                borderRadius: 8,
              },
            ]}
          >
            {safeUri && (
              <VideoPlaybackCanvas
                clip={{ uri: currentClip?.uri }}
                zoom={0}
                x={0}
                y={0}
                isPreview={isPreview}
                keyframes={keyframesShared}
                overlays={overlaysShared}
                gestureModeShared={gestureModeShared}
                currentTime={currentTimeShared}
                trimStart={trimStart}
                trimEnd={trimEnd}
                paused={paused}
                setPaused={setPaused}
                setPlaybackTime={setCurrentTime}
                videoLayout={videoLayoutShared}
                videoRef={videoRef}
                previewSessionId={clipId}
                onLoad={onLoad}
                resizeMode="cover"
                onProgress={onProgress}
                videoNaturalWidthShared={videoNaturalWidthShared}
                videoNaturalHeightShared={videoNaturalHeightShared}
              />
            )}
          </Animated.View>

          {/* Overlayed Controls */}
          <View style={styles.controlsOverlayContainer}>
            {/* Progress Bar */}
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${(currentTime / trimEnd) * 100}%`,
                  },
                ]}
              />
            </View>

            {/* Buttons */}
            <View style={styles.controlsRow}>
              <TouchableOpacity onPress={togglePlayPause} style={styles.playPauseButton}>
                <Text style={styles.playPauseText}>
                  {paused ? '▶' : '⏸︎'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.playbackTime}>
                {formatTime(currentTime)} / {formatTime(trimEnd)}
              </Text>
            </View>
          </View> 
        </View>

        {/* Trimming Controls */}
        <View style={styles.toggleRow}>
          <Text style={[styles.subtitle]}>Trim:</Text>
        </View>

        {Number.isFinite(duration) && duration > 0 && trimEnd > trimStart && (
          <TrimSlider
            duration={duration}
            trimStart={trimStart}
            trimEnd={trimEnd}
            setPaused={setPaused}
            onTrimChange={handleTrimChange}
            minimumTrackTintColor={colors.accent1}
            maximumTrackTintColor={colors.surface}
            thumbTintColor={colors.accent1}
          />
        )}

        {/* Aspect Ratio */}
        <View style={styles.toggleRow}>
          <Text style={[styles.subtitle]}>Aspect Ratio:</Text>
        </View>
        <View style={styles.aspectRatioList}>
          {Object.entries(ASPECT_RATIOS).map(([key, option]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.aspectRatioButton,
                aspectRatio.label === option.label && styles.aspectRatioButtonSelected,
              ]}
              onPress={() => {
                setAspectRatio(option);
              }}
            >
              <Text
                style={[
                  styles.aspectRatioButtonText,
                  aspectRatio.label === option.label && styles.aspectRatioButtonTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Categories */}
        <View style={styles.toggleRow}>
          <Text style={[styles.subtitle]}>Select Category:</Text>
        </View>
        <View style={styles.categoryList}>
          {allCategories.map((cat) => {
            const isCustom = customCategories.includes(cat);
            const isSelected = currentClip.category === cat;

            return (
              <View key={cat} style={styles.categoryWrapper}>
                <TouchableOpacity
                  style={[
                    styles.categoryButton,
                    isSelected && styles.categoryButtonSelected,
                  ]}
                  onPress={() => assignCategory(cat)}
                >
                  <Text
                    style={[
                      styles.categoryButtonText,
                      isSelected && styles.categoryButtonTextSelected,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
                {isCustom && (
                  <TouchableOpacity
                    onPress={() => deleteCustomCategory(cat)}
                    style={styles.deleteIconContainer}
                  >
                    <Text style={styles.deleteIcon}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* Smart Zoom Control */}
        <View style={styles.toggleRow}>
          <Text style={styles.subtitle}>Smart Zoom:</Text>
          {!hasSmartZoom ? (
            <TouchableOpacity
              onPress={handleSmartZoom}
              style={styles.primaryButton}
            >
              <Text style={styles.buttonText}>Set Up</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.actionGroup}>
              <TouchableOpacity
                onPress={handleSmartZoomEdit}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSmartZoomReset}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>Reset</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Object Tracking Control */}
        <View style={styles.toggleRow}>
          <Text style={styles.subtitle}>Tracking:</Text>
          {!hasObjectTracking ? (
            <TouchableOpacity
              onPress={() => handleSmartTracking([])}
              style={styles.primaryButton}
            >
              <Text style={styles.buttonText}>Set Up</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.actionGroup}>
              <TouchableOpacity
                onPress={() => handleSmartTracking(currentClip.markerKeyframes)}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const updated = [...clips];
                  updated[currentIndex].markerKeyframes = [];
                  setClips(updated);
                }}
                style={styles.secondaryButton}
              >
                <Text style={styles.buttonText}>Reset</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Export */}
        <View style={styles.exportControls}>
          <Button title="Batch Export All Clips" onPress={handleBatchExport} />
          {isBatchExporting && (
            <Text>
              Exporting {batchExportProgress.current}/{batchExportProgress.total}
            </Text>
          )}
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Fixed footer navigation buttons */}
      <SafeAreaView style={styles.bottomNavContainer}>
        <ClipNavigation
          currentIndex={currentIndex}
          totalClips={clips.length}
          onNext={goNext}
          onPrevious={goPrev}
        />
      </SafeAreaView>

      {/* Modal for creating new category */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 12, color: colors.textPrimary }}>
              Create New Category
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Category name"
              placeholderTextColor={colors.placeholder}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              autoFocus
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={{
                  backgroundColor: colors.accent2,
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600', textAlign: 'center' }}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={addCustomCategory}
                style={{
                  backgroundColor: colors.accent1,
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: colors.textPrimary, fontWeight: '600', textAlign: 'center' }}>
                  Add
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  </SafeAreaView>
);
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 80,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 4,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  categoryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
    marginTop: 8,
  },
  categoryWrapper: {
    position: 'relative',
    marginRight: 8,
    marginBottom: 8,
  },
  categoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryButtonSelected: {
    backgroundColor: colors.accent1,
  },
  categoryButtonText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  categoryButtonTextSelected: {
    color: colors.textPrimary,
  },
  deleteIconContainer: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors.surface,
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 1,
  },
  deleteIcon: {
    color: colors.textSecondary,
    fontWeight: 'bold',
    fontSize: 14,
    lineHeight: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContainer: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 12,
    elevation: 5,
  },
  input: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.inputBackground,
  },
  videoWrapper: {
    position: 'relative',
    width: '100%',
    backgroundColor: colors.background,
    alignSelf: 'center',
    marginBottom: 5,
  },
  exportControls: { 
    marginTop: 20, 
    gap: 10 
  },
  toggleRow: {
    marginTop: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  toggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  primaryButton: {
    backgroundColor: colors.accent1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginLeft: 8,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonText: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  aspectRatioList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 5,
  },
  aspectRatioButton: {
    backgroundColor: colors.surface,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    margin: 4,
    marginBottom: 5,
  },
  aspectRatioButtonSelected: {
    backgroundColor: colors.accent1,
  },
  aspectRatioButtonText: {
    color: colors.textPrimary,
    fontSize: 12,
  },
  aspectRatioButtonTextSelected: {
    color: 'white',
    fontWeight: 'bold',
  },
  videoContainerBase: {
    backgroundColor: 'black',
    borderRadius: 8,
    overflow: 'hidden',
  },
  playPauseButton: {
      backgroundColor: 'rgba(255, 255, 255, 0.8)',
      borderRadius: 10,
      padding: 4,
    },
  playPauseText: {
      fontSize: 10,
      color: 'black',
    },
  playbackTime: {
      color: 'white',
      fontSize: 10,
    },
  controlsOverlayContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingBottom: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 1,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
  },
  progressBarBackground: {
    height: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',//'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
    width: '100%',
  },
  progressBarFill: {
    height: 4,
    backgroundColor: "white", //'#fff',
    borderRadius: 2,
  },
});