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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateProject, getAllProjects } from '../../utils/storage'; 
import { interpolateSmartZoom } from '../../utils/interpolateSmartZoom'; 
import Video from 'react-native-video';
import TrimSlider from '../../components/TrimSlider'; 
import { saveTrimInfo, loadTrimInfo } from '../../utils/trimStorage';
import { colors } from '../../theme/theme';
import ClipNavigation from '../../navigation/ClipNavigation';
import RNFS from 'react-native-fs';
import VideoEditorNativeModule from '../../nativemodules/VideoEditorNativeModule';

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
  const [paused, setPaused] = useState(false);
  const [loopTrimPreview, setLoopTrimPreview] = useState(true);

  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const [batchExportProgress, setBatchExportProgress] = useState({ current: 0, total: 0 });

  const projectId = project?.id;
  const clipId = currentClip?.id || currentClip?.uri;
  const hasSmartZoom = clips[currentIndex]?.smartZoomKeyframes != null;

  // Load trim info when project or clip changes
  useEffect(() => {
    async function fetchTrim() {
      if (projectId && clipId) {
        const savedTrim = await loadTrimInfo(projectId, clipId);
        if (savedTrim) {
          setTrimStart(savedTrim.startTime ?? 0);
          setTrimEnd(savedTrim.endTime ?? duration); // fallback to duration
        } else {
          setTrimStart(0);
          setTrimEnd(duration);
        }
      }
    }
    fetchTrim();
  }, [projectId, clipId, duration]);

  // Load saved custom categories
  useEffect(() => {
    loadCustomCategories();
  }, []);

  // Save edited clips back to the project when the user leaves the screen
  useEffect(() => {
    
  const handleSmartZoom = () => {
    navigation.navigate('SmartZoom', {
      project: project,
      videoUri: currentClip?.uri,
      trimStart: currentClip?.trimStart ?? 0,
      trimEnd: currentClip?.trimEnd ?? currentClip?.duration,
      duration: currentClip?.duration,
      clipIndex: currentIndex,
    });
  };

  return () => {
      saveEditedClipsToProject();
    };
  }, [clips]);

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

  // Handle updated smart zoom keyframes from SmartZoom screen 
  useEffect(() => {
    if (route.params?.updatedSmartZoom) {
      const { clipIndex, keyframes } = route.params.updatedSmartZoom;
      const updatedClips = [...clips];
      updatedClips[clipIndex] = {
        ...updatedClips[clipIndex],
        smartZoomKeyframes: keyframes
      };
      setClips(updatedClips);

      // Optional: Clear the param to prevent double-applying
      navigation.setParams({ updatedSmartZoom: null });
    }
  }, [route.params?.updatedSmartZoom]);

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
  
      const updatedProject = { ...project, clips };
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
      }));

      const outputPath = `${RNFS.CachesDirectoryPath}/merged_output_${Date.now()}.mov`; // or .mp4

      const mergedVideoPath = await VideoEditorNativeModule.process({
        type: 'merge',
        clips: clipsToMerge,
        outputPath,
      });

      Alert.alert('Success', 'Merged video exported to Camera Roll');

    } catch (error) {
      console.error('Batch export failed:', error);
      Alert.alert('Error', 'Failed to export merged video.');
    }
  };

  const onLoad = (data) => {
    setDuration(data.duration);
    setTrimEnd(Math.min(data.duration, trimEnd || data.duration));
    videoRef.current?.seek(trimStart);
  };

  const onError = (error) => {
    console.log('Video playback error:', error);
  };

  const onProgress = (data) => {
    const current = data.currentTime;

    if (current < trimStart) {
      videoRef.current?.seek(trimStart);
    } else if (current >= trimEnd) {
      if (loopTrimPreview) {
        videoRef.current?.seek(trimStart);
      } else {
        setPaused(true);
      }
    }

    setCurrentTime(current);
  };

  const togglePlayPause = () => {
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
    navigation.navigate('SmartZoom', {
      project: project,
      videoUri: currentClip?.uri,
      trimStart,
      trimEnd,
      duration,
      clipIndex: currentIndex, 
    });
  };

  const smartZoomTransform = currentClip.smartZoomKeyframes
    ? interpolateSmartZoom(currentClip.smartZoomKeyframes, currentTime)
    : null;

  const transformStyle = smartZoomTransform
    ? {
        transform: [
          { scale: smartZoomTransform.zoom },
          { translateX: -smartZoomTransform.x },
          { translateY: -smartZoomTransform.y },
        ]
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

return (
  <SafeAreaView style={styles.safeArea}>
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>
          {project.name} - Clip {currentIndex + 1} / {clips.length}
        </Text>

        {/* Video Player */}
        <Text style={[styles.subtitle]}>TEST 2:</Text>
        <View style={styles.videoWrapper}>
          <View style={[styles.videoZoomContainer, transformStyle]}>
            <Video
              ref={videoRef}
              source={currentClip?.uri ? { uri: currentClip.uri } : undefined}
              onLoad={onLoad}
              onError={onError}
              onProgress={onProgress}
              style={styles.video}
              resizeMode="contain"
              controls={false}
              paused={paused}
            />
          </View>

          <View style={styles.playbackControls}>
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

        {/* Trimming Controls */}
        <View style={styles.toggleRow}>
          <Text style={[styles.subtitle]}>Trim:</Text>
        </View>
        {duration > 0 && (
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

        {/* Categories */}
        <View style={styles.toggleRow}>
          <Text style={[styles.subtitle, ]}>Select Category:</Text>
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

        {/* Athlete Tracking Control */}
        <View style={styles.toggleRow}>
          <Text style={styles.subtitle}>Athlete Tracking:</Text>
          <TouchableOpacity
            onPress={() => setTrackingEnabled(!trackingEnabled)}
            style={[
              styles.toggleButton,
              { backgroundColor: trackingEnabled ? colors.danger : colors.accent1 },
            ]}
          >
            <Text style={styles.buttonText}>
              {trackingEnabled ? 'Disable' : 'Enable'}
            </Text>
          </TouchableOpacity>
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
  inner: {
    padding: 16,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    color: colors.textPrimary,
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
  videoContainer: {
    height: 200,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
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
  navButtonsFixed: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
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
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.background,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 16,
  },
  inputGroup: {
    flex: 1,
    marginRight: 8,
  },
  heading: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
    color: colors.textPrimary,
  },
  trimControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 16,
  },
  trimInput: {
    flex: 1,
    marginHorizontal: 8,
  },
  videoWrapper: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.background,
  },
  playbackControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.overlay,
    paddingVertical: 2,
    paddingHorizontal: 12,
    // borderBottomLeftRadius: 12,
    // borderBottomRightRadius: 12,
  },
  playPauseButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.125)', // semi-transparent white (like '#ffffff20')
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  playPauseText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  playbackTime: {
    color: colors.textPrimary,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  iconButton: {
    borderRadius: 30,
    overflow: 'hidden',
  },
  iconBackground: {
    backgroundColor: colors.background,
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportControls: { 
    marginTop: 20, 
    gap: 10 
  },
  marker: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'red',
    borderWidth: 2,
    borderColor: 'white',
  },
  videoZoomContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  toggleRow: {
    marginTop: 20,
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

});