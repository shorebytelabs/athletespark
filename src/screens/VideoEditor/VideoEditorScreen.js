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
  NativeModules,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateProject, getAllProjects } from '../../utils/storage'; 
import Video from 'react-native-video';
import TrimSlider from '../../components/TrimSlider'; 
import { saveTrimInfo, loadTrimInfo, removeTrimInfo } from '../../utils/trimStorage';
import { colors } from '../../theme/theme';
import { useTheme } from '@react-navigation/native';
import ClipNavigation from '../../navigation/ClipNavigation';

const { VideoEditorModule } = NativeModules;

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

export default function VideoEditorScreen({ route, navigation }) {
  const { project, onClipUpdate, currentClip: routeCurrentClip} = route.params ?? {};

  const videoRef = useRef(null);

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
  const trimKey = currentClip
    ? `trim-${currentClip.id || currentClip.uri}`
    : 'trim-unknown';

  const [isTrimming, setIsTrimming] = useState(false);

  const projectId = project?.id;
  const clipId = currentClip?.id || currentClip?.uri;

  // Helper function to generate a unique storage key per project+clip
  const getTrimStorageKey = (projectId, clipId) => `trim_${projectId}_${clipId}`;

  function onTrimChange(trimStart, trimEnd) {
    setTrimStart(trimStart);
    setTrimEnd(trimEnd);
    saveTrimInfo(projectId, clipId, { startTime: trimStart, endTime: trimEnd });
  }

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

  useEffect(() => {
    if (currentClip) {
      setTrimStart(currentClip.startTime ?? 0);
      setTrimEnd(currentClip.endTime ?? currentClip.duration ?? 5);
    }
  }, [currentClip]);

  // When trimStart changes, seek to that time, but only if duration is valid
  useEffect(() => {
    if (videoRef.current && trimStart < trimEnd && duration > 0) {
      videoRef.current.seek(trimStart);
      setPaused(false); // ensure video plays after seek
    }
  }, [trimStart, trimEnd, duration]);

  // Save trim info whenever trim changes
  const handleTrimChange = async (start, end) => {
    setTrimStart(start);
    setTrimEnd(end);
    setPaused(true);
    if (videoRef.current) videoRef.current.seek(start);

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
      console.log('Project clips saved');
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

  const handleTrimAndExport = async () => {
    try {
      setIsTrimming(true);

      const inputPath = currentClip.uri.replace('file://', '');
      const basePath = inputPath.replace(/\.\w+$/, '');
      const timestamp = Date.now();
      const outputPath = `${basePath}_trimmed_${timestamp}.mov`;

      const result = await VideoEditorModule.trimVideo(
        inputPath,
        trimStart,
        trimEnd,
        outputPath
      );

      const newUri = 'file://' + result;
      const updatedClip = {
        ...currentClip,
        uri: newUri,
        trimStart,
        trimEnd,
      };

      const updatedClips = [...clips];
      updatedClips[currentIndex] = updatedClip;
      setClips(updatedClips);

      if (onClipUpdate) onClipUpdate(updatedClip);

      Alert.alert('Success', `Trimmed video saved:\n${newUri}`);
    } catch (e) {
      console.error('Video trimming failed', e);
      Alert.alert('Error', 'Failed to trim the video.');
    } finally {
      setIsTrimming(false);
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

  if (!currentClip || !currentClip.uri) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.title}>No clip selected or clip is missing data.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>
            {project.name} - Clip {currentIndex + 1} / {clips.length}
          </Text>

          {/* Video Player Placeholder */}
           <View style={styles.videoContainer}>
            <Video
              ref={videoRef}
              source={currentClip?.uri ? { uri: currentClip.uri } : undefined}
              onLoad={onLoad}
              onError={onError}
              onProgress={onProgress}
              style={styles.video}
              resizeMode="contain"
              controls={true}
              paused={paused}
            />
          </View> 

          <View style={styles.videoWrapper}>
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
          <Text style={[styles.subtitle, { color: colors.textPrimary }]}>Trim:</Text>
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
          <Text style={[styles.subtitle, { color: colors.textPrimary }]}>Select Category:</Text>
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

          {/* Tracking toggle */}
          <View style={styles.trackingContainer}>
            <Text style={[styles.subtitle, { color: colors.textPrimary }]}>Athlete Tracking:</Text>

            <TouchableOpacity
              onPress={() => setTrackingEnabled(!trackingEnabled)}
              style={{
                backgroundColor: trackingEnabled ? colors.danger : colors.accent1,
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
                {trackingEnabled ? 'Disable' : 'Enable'}
              </Text>
            </TouchableOpacity>
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
    color: colors.textSecondary,
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
  trackingContainer: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
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
});