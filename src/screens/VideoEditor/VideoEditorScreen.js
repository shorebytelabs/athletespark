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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateProject } from '../../utils/storage'; 
import Video from 'react-native-video';
import MultiSlider from '@ptomasroos/react-native-multi-slider';

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
  const { project, onClipUpdate, currentClip: routeCurrentClip} = route.params;
  const videoRef = useRef(null);

  const [clips, setClips] = useState(project.clips); // Use project clips directly
  const [currentIndex, setCurrentIndex] = useState(0);
  const [trackingEnabled, setTrackingEnabled] = useState(false);

  const [customCategories, setCustomCategories] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

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

  const currentClip = clips[currentIndex];

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

    const [isTrimming, setIsTrimming] = useState(false);
    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [paused, setPaused] = useState(false);
    const [loopTrimPreview, setLoopTrimPreview] = useState(true);

    // Seek to trimStart when it changes
    useEffect(() => {
      if (videoRef.current && trimStart < trimEnd) {
        videoRef.current.seek(trimStart);
      }
    }, [trimStart]);

    useEffect(() => {
      setTrimStart(trimStart);
      setTrimEnd(trimEnd);
    }, [trimStart, trimEnd]);

    useEffect(() => {
    if (currentClip?.startTime != null && currentClip?.endTime != null) {
      setTrimStart(currentClip.startTime);
      setTimeEnd(currentClip.endTime);
    } else {
      setTrimStart(0);
      setTrimEnd(currentClip?.duration || 5); // fallback to 5s if unknown
    }
  }, [currentIndex]);

  useEffect(() => {
  if (currentClip) {
    const start = currentClip.startTime ?? 0;
    const end = currentClip.endTime ?? currentClip.duration ?? 5;
    setTrimStart(start);
    setTrimEnd(end);
  }
  }, [currentClip]);

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

    // Clamp playback to trimmed end
    if (current >= trimEnd) {
      if (loopTrimPreview) {
        videoRef.current?.seek(trimStart);
      } else {
        setPaused(true);
      }
    }

    // Clamp if it somehow goes before the trimmed start
    if (current < trimStart) {
      videoRef.current?.seek(trimStart);
    }

    setCurrentTime(current);
  };

  // When trimStart changes, seek to that time, but only if duration is valid
  useEffect(() => {
    if (videoRef.current && trimStart < trimEnd && duration > 0) {
      videoRef.current.seek(trimStart);
      setPaused(false); // ensure video plays after seek
    }
  }, [trimStart, trimEnd, duration]);

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
              source={{ uri: currentClip.uri }}
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
              source={{ uri: currentClip.uri }}
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
          <Text style={styles.subtitle}>Trim:</Text>
          <Text style={{ fontSize: 12, marginTop: 4 }}>
            Trimmed: Start {trimStart.toFixed(1)}s – End {trimEnd.toFixed(1)}s
          </Text>

          <Text style={{ fontSize: 12, marginTop: 4 }}>
            Showing { (trimEnd - trimStart).toFixed(1) }s of { duration.toFixed(1) }s
          </Text>

          {duration > 0 && (
            <MultiSlider
              values={[trimStart, trimEnd]}
              sliderLength={300}
              onValuesChange={(values) => {
                const [start, end] = values;
                setTrimStart(start);
                setTrimEnd(end);

                // Force pause and seek immediately
                if (videoRef.current) {
                  videoRef.current.seek(start);
                }
                setPaused(true);
              }}
              min={0}
              max={duration}
              step={0.1}
              selectedStyle={{ backgroundColor: '#00f' }}
              unselectedStyle={{ backgroundColor: '#888' }}
              markerStyle={{ backgroundColor: '#fff' }}
            />
          )}

          {/* Categories */}
          <Text style={styles.subtitle}>Select Category:</Text>
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
            <Text style={styles.subtitle}>Athlete Tracking:</Text>
            <Button
              title={trackingEnabled ? 'Disable' : 'Enable'}
              onPress={() => setTrackingEnabled(!trackingEnabled)}
            />
          </View>

          <View style={{ height: 80 }} />
        </ScrollView>

        {/* Fixed footer navigation buttons */}
        <View style={styles.navButtonsFixed}>
          <Button title="Previous" onPress={goPrev} disabled={currentIndex === 0} />
          <Button title="Next" onPress={goNext} />
        </View>

        {/* Modal for creating new category */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 12 }}>
                Create New Category
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Category name"
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                autoFocus
              />
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}
              >
                <Button title="Cancel" onPress={() => setModalVisible(false)} />
                <Button title="Add" onPress={addCustomCategory} />
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { padding: 16 },
  label: { fontSize: 16, marginBottom: 8 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 80,
  },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  videoContainer: {
    height: 200,
    backgroundColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  subtitle: { fontSize: 14, marginBottom: 4, fontWeight: 'bold' },
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
    backgroundColor: '#eee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryButtonSelected: {
    backgroundColor: '#007AFF',
  },
  categoryButtonText: {
    fontSize: 12,
    color: '#333',
  },
  categoryButtonTextSelected: {
    color: '#fff',
  },
  deleteIconContainer: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#eee',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#999',
    zIndex: 1,
  },
  deleteIcon: {
    color: '#666',
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
    backgroundColor: '#fff',
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    elevation: 5,
  },
  input: {
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
  video: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 16,
  },
  inputGroup: { flex: 1, marginRight: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
  },
  heading: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
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
    aspectRatio: 16 / 9, // or adjust based on your video
    backgroundColor: '#000', // fallback background behind video
  },
  playbackControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 2,    // reduced from 8 to 4
    paddingHorizontal: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  playPauseButton: {
    backgroundColor: '#ffffff20',
    paddingVertical: 2,    // reduced from 6 to 4
    paddingHorizontal: 10, // reduced slightly from 14 to 12
    borderRadius: 8,
  },
  playPauseText: {
    color: '#fff',
    fontSize: 12,          // reduced from 16 to 14
    fontWeight: '600',
  },
  playbackTime: {
    color: '#fff',
    fontSize: 10,          // reduced from 14 to 12
    fontVariant: ['tabular-nums'],
  },
  iconButton: {
    borderRadius: 30,    // Circular touch area
    overflow: 'hidden',
  },
  iconBackground: {
    backgroundColor: 'black',
    borderRadius: 20,    // Circle background for icon
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
