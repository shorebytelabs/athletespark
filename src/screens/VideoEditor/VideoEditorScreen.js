// TEMPORARILY DISABLED: Guided Follow option in Player Spotlight
// - All Guided Follow code is preserved but inactive
// - Only Intro Spotlight is available to users
// - To re-enable: uncomment Guided Follow options in modal and restore conditional logic
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
import Animated, { useSharedValue, runOnUI } from 'react-native-reanimated';
import VideoPlaybackCanvas from '../../components/VideoPlaybackCanvas';
import { trackingCallbackRef } from '../../utils/trackingCallbackRegistry';
import { SPOTLIGHT_MODES } from '../../constants/playerSpotlight'; 

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
  const {
  project: initialProject,
  onClipUpdate,
  currentClip: routeCurrentClip,
} = route.params ?? {};

// keep a fresh copy in RAM so we can mutate it and stay in sync
const [project, setProject] = useState(initialProject);

// writes to storage **and** refreshes the in-memory copy
const saveProject = async (patch) => {
  const next = { ...project, ...patch };
    await updateProject(next);   // 💾 persists to AsyncStorage / DB
    setProject(next);            // 🧠 refreshes local state so future edits use it
};

  const [keyframes, setKeyframes] = useState([]);
  const videoRef = useRef(null);
  const [markerPos, setMarkerPos] = useState({ x: 0.5, y: 0.5 });

  const [clips, setClips] = useState(project?.clips ?? []);
  const [currentIndex, setCurrentIndex] = useState(0);

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
  const hasSmartZoom = !!currentClip.smartZoomKeyframes?.length;
  const [safeUri, setSafeUri] = useState(null);
  const [aspectRatio, setAspectRatio] = useState(project?.aspectRatio ?? ASPECT_RATIOS.PORTRAIT);
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const currentTimeShared = useSharedValue(trimStart);
  const videoLayoutShared = useSharedValue(null);
  const videoNaturalWidthShared = useSharedValue(null);
  const videoNaturalHeightShared = useSharedValue(null);
  const isPreview = useSharedValue(true);
  const [hasTracking, setHasTracking] = React.useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [spotlightModalOpen, setSpotlightModalOpen] = useState(false);   

  const [spotlightMode, setSpotlightMode] = useState(
    currentClip?.spotlightMode ?? null
  );

  // Spotlight effect state
  const [spotlightState, setSpotlightState] = useState({
    isActive: false,
    startTime: 0,
    duration: 0,
    originalOverlays: [],
    spotlightOverlay: null
  });

  // Track when spotlight was last triggered to prevent double-triggering
  const lastTriggeredTimeRef = useRef(0);
  
  // Reset cooldown when clip changes or component mounts
  useEffect(() => {
    lastTriggeredTimeRef.current = 0;
    console.log('🎯 Cooldown reset - clip changed or component mounted, clipId:', currentClip?.id);
  }, [currentClip?.id]);
  
  // Also reset cooldown when component first mounts
  useEffect(() => {
    lastTriggeredTimeRef.current = 0;
    console.log('🎯 Cooldown reset - component mounted');
  }, []); // Empty dependency array means this runs once on mount
  
  // Note: Removed cooldown reset on pause change to prevent double-triggering
  // The cooldown should only reset when video goes back to beginning or clip changes
  
  // Reset cooldown when video goes back to the beginning (but not during spotlight pause/resume)
  useEffect(() => {
    const currentTime = currentTimeShared.value;
    console.log('🎯 Time check - currentTime:', currentTime, 'lastTriggered:', lastTriggeredTimeRef.current);
    
    // Only reset cooldown if video is at the very beginning AND we're not in a spotlight pause
    if (currentTime < 0.1 && lastTriggeredTimeRef.current > 0 && !spotlightState.isActive) {
      lastTriggeredTimeRef.current = 0;
      console.log('🎯 Cooldown reset - video at beginning, currentTime:', currentTime);
    }
  }, [currentTimeShared.value, spotlightState.isActive]);

  // Note: Removed cooldown reset on pause change to prevent double-triggering
  // The cooldown should only reset when video goes back to beginning, clip changes, or manual play button press

  // Add a manual reset function for the play button
  const handlePlayPause = () => {
    // Reset cooldown when starting a new play session
    if (paused && lastTriggeredTimeRef.current > 0) {
      lastTriggeredTimeRef.current = 0;
      console.log('🎯 Cooldown reset - manual reset on play button press');
    }
    togglePlayPause();
  };

  // Create effective overlays that show spotlight overlay when active, otherwise original overlays
  const effectiveOverlaysShared = useSharedValue([]);

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
        await saveProject(updatedProject);

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

  // Debug currentClip changes
  useEffect(() => {
    console.log('🎯 Current clip changed:', currentClip?.id, 'markerKeyframes:', currentClip?.markerKeyframes);
    console.log('🎯 Current clip spotlight mode:', currentClip?.spotlightMode);
    console.log('🎯 Current clip has markerKeyframes:', !!currentClip?.markerKeyframes, 'length:', currentClip?.markerKeyframes?.length);
  }, [currentClip?.id, currentClip?.markerKeyframes, currentClip?.spotlightMode]);

  // Spotlight effect implementation
  useEffect(() => {
    console.log('🎯 Spotlight useEffect triggered for clip:', currentClip?.id, 'markerKeyframes:', currentClip?.markerKeyframes);
    
    if (!currentClip?.markerKeyframes || !Array.isArray(currentClip.markerKeyframes) || currentClip.markerKeyframes.length === 0) {
      console.log('🎯 No markerKeyframes found for clip:', currentClip?.id);
      return;
    }

    const spotlight = currentClip.markerKeyframes[0]; // MVP: only support one spotlight
    console.log('🎯 Spotlight data:', spotlight);
    
    if (!spotlight || typeof spotlight.timestamp !== 'number') {
      console.log('🎯 Invalid spotlight data for clip:', currentClip?.id, 'spotlight:', spotlight);
      return;
    }

    const spotlightTime = spotlight.timestamp;
    const freezeDuration = spotlight.freezeDuration || 0.7;
    
    console.log('🎯 Spotlight configured - time:', spotlightTime, 'duration:', freezeDuration, 'marker:', spotlight.markerType);
    console.log('🎯 Initial cooldown state - lastTriggeredTimeRef:', lastTriggeredTimeRef.current);

    // Check if we're at the spotlight time
    const checkSpotlight = (currentTime) => {
      const timeDiff = Math.abs(currentTime - spotlightTime);
      const isAtSpotlightTime = timeDiff < 0.3; // 300ms tolerance to account for video playback precision

      // Check if we've triggered this spotlight recently (prevent double-triggering)
      const timeSinceLastTrigger = Math.abs(currentTime - lastTriggeredTimeRef.current);
      const hasCooldownPassed = lastTriggeredTimeRef.current === 0 || timeSinceLastTrigger > 3.0; // Allow first trigger, then 3 second cooldown
      
      // Debug timing when close to spotlight time
      if (Math.abs(currentTime - spotlightTime) < 0.8) {
        console.log('🎯 Timing check - currentTime:', currentTime.toFixed(2), 'spotlightTime:', spotlightTime.toFixed(2), 'timeDiff:', timeDiff.toFixed(2), 'isAtSpotlightTime:', isAtSpotlightTime);
        console.log('🎯 Cooldown check - currentTime:', currentTime.toFixed(2), 'lastTriggered:', lastTriggeredTimeRef.current.toFixed(2), 'timeSince:', timeSinceLastTrigger.toFixed(2), 'cooldownPassed:', hasCooldownPassed);
      }

      if (isAtSpotlightTime && !spotlightState.isActive && hasCooldownPassed) {
        // Update the ref immediately to prevent double-triggering
        lastTriggeredTimeRef.current = currentTime;
        
        // Start spotlight - store current overlays and create spotlight overlay
        const currentOverlays = overlaysShared.value || [];
        const startTimestamp = Date.now(); // Use actual timestamp for timer
        setSpotlightState({
          isActive: true,
          startTime: startTimestamp, // Store actual timestamp in milliseconds
          duration: freezeDuration,
          originalOverlays: [...currentOverlays],
          spotlightOverlay: {
            timestamp: spotlightTime,
            x: spotlight.x || 200,
            y: spotlight.y || 400,
            markerType: spotlight.markerType || 'circle'
          }
        });
        
        // Pause the video
        setPaused(true);
        console.log('🎯 Spotlight started at video time:', spotlightTime, 'for duration:', freezeDuration, 'seconds');
        console.log('🎯 Actual start timestamp:', startTimestamp);
      } else if (isAtSpotlightTime && !spotlightState.isActive && !hasCooldownPassed) {
        console.log('🎯 Spotlight blocked by cooldown - time since last trigger:', timeSinceLastTrigger.toFixed(2), 'seconds');
      }
    };

    // Check if spotlight should end - use timer instead of video time
    const checkSpotlightEnd = () => {
      if (spotlightState.isActive) {
        const now = Date.now();
        const elapsed = (now - spotlightState.startTime) / 1000; // Convert to seconds
        console.log('🎯 Spotlight check - elapsed:', elapsed.toFixed(2), 'duration:', spotlightState.duration);
        if (elapsed >= spotlightState.duration) {
          // End spotlight
          setSpotlightState({
            isActive: false,
            startTime: 0,
            duration: 0,
            originalOverlays: [],
            spotlightOverlay: null
          });
          
          // Resume video playback
          setPaused(false);
          console.log('🎯 Spotlight ended after:', elapsed.toFixed(2), 'seconds');
        }
      }
    };

    // Monitor current time for spotlight timing
    const interval = setInterval(() => {
      const currentTime = currentTimeShared.value;
      checkSpotlight(currentTime);
      checkSpotlightEnd(); // No need to pass currentTime since we use Date.now()
    }, 50); // Check every 50ms

    return () => clearInterval(interval);
  }, [currentClip?.markerKeyframes, spotlightState.isActive, spotlightState.startTime, spotlightState.duration, currentTimeShared, setPaused]);

  // Update effective overlays based on spotlight state
  useEffect(() => {
    if (spotlightState.isActive && spotlightState.spotlightOverlay) {
      // Show only the spotlight overlay during spotlight
      runOnUI(() => {
        effectiveOverlaysShared.value = [spotlightState.spotlightOverlay];
      })();
    } else {
      // Show original overlays when spotlight is not active
      runOnUI(() => {
        effectiveOverlaysShared.value = spotlightState.originalOverlays;
      })();
    }
  }, [spotlightState.isActive, spotlightState.spotlightOverlay, spotlightState.originalOverlays]);

  // Collect initial marker keyframes for SmartTracking
  const collectInitialMarkerKeyframes = () => {
    if (latestMarkerKeyframesRef.current?.length) {
      return latestMarkerKeyframesRef.current.map(k => ({ ...k }));
    } else if (Array.isArray(overlaysShared.value) && overlaysShared.value.length) {
      return overlaysShared.value.map(k => ({ ...k }));
    } else if (Array.isArray(currentClip?.markerKeyframes) && currentClip.markerKeyframes.length) {
      return currentClip.markerKeyframes.map(k => ({ ...k }));
    } else {
      return [];
    }
  };

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
    await saveProject(updatedProject);
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

  const assignCategory = async (category) => {
    if (category === 'Other / Create New') {
      setNewCategoryName('');
      setModalVisible(true);
      return;
    }

    /* 1. update React state */
    const updatedClips = [...clips];
    updatedClips[currentIndex] = {
      ...updatedClips[currentIndex],
      // deselect if tapped twice
      category: updatedClips[currentIndex].category === category ? null : category,
    };
    setClips(updatedClips);

    /* 2. persist to storage */
    try {
      await saveProject({ ...project, clips: updatedClips });
    } catch (err) {
      console.warn('⚠️  failed to persist category', err);
    }
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

  // Keep overlaysShared in-sync with the clip we’re viewing
  useEffect(() => {
    if (Array.isArray(currentClip?.markerKeyframes)) {
      overlaysShared.value = currentClip.markerKeyframes;
    } else {
      overlaysShared.value = [];
    }
  }, [currentClip?.markerKeyframes]);

  /* 🔄 keep Player-Spotlight state in sync with the current clip */
  useEffect(() => {
    const has = Array.isArray(currentClip?.markerKeyframes) &&
                currentClip.markerKeyframes.length > 0;

    setHasTracking(has);
    setSpotlightMode(currentClip?.spotlightMode ?? null);
  }, [
    currentClip?.id,
    currentClip?.markerKeyframes,
    currentClip?.spotlightMode,
  ]);

  useEffect(() => {
    if (!currentClip) return;

    const kf = Array.isArray(currentClip.markerKeyframes)
      ? currentClip.markerKeyframes
      : [];

    runOnUI((_copy) => {
      // always hand Reanimated a brand-new reference
      overlaysShared.value = _copy;
    })(kf.map(o => ({ ...o })));   // <- plain JS clone

    setHasTracking(kf.length > 0);
  }, [currentClip?.markerKeyframes, currentClip?.id]);

  useEffect(() => {
    if (Array.isArray(currentClip?.markerKeyframes)) {
      latestMarkerKeyframesRef.current = currentClip.markerKeyframes.map(k => ({ ...k }));
    }
  }, [currentClip?.markerKeyframes, currentClip?.id]);

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

  const handleSmartZoomReset = async () => {

    const updated = [...clips];
    updated[currentIndex].smartZoomKeyframes = null;
    setClips(updated);

  try {
      await saveProject({ ...project, clips: updated });
    } catch (err) {
      console.warn('⚠️  failed to persist smartZoom reset', err);
    }
  };

  const latestMarkerKeyframesRef = useRef([]);

  const handleSmartTracking = () => {
    /* -----------------------------------------------------------
    * 1️⃣  Figure out which key-frames to send to the editor
    * -----------------------------------------------------------
    * ‣ latestMarkerKeyframesRef.current → always the freshest
    * ‣ overlaysShared.value             → fresh unless editing
    * ‣ currentClip.markerKeyframes      → last on-disk copy
    */

    const initial = collectInitialMarkerKeyframes();

    console.log('🔗 Pushing to SmartTracking with', JSON.stringify(initial));

    /* -----------------------------------------------------------
    * 2️⃣  Callback the editor will invoke when the user taps “Save”
    * -----------------------------------------------------------
    */
    trackingCallbackRef.current = async (updated, mode) => {
      /* 2.1  Update React state */
      const nextClips              = [...clips];
      nextClips[currentIndex]      = {
        ...nextClips[currentIndex],
        markerKeyframes: updated,
        spotlightMode: mode,  
      };
      setClips(nextClips);
      setSpotlightMode(mode);
      saveProject({ ...project, clips: nextClips }).catch(console.warn);

      /* 2.2  Update shared value -> canvas refresh happens instantly */
      runOnUI(kfs => { overlaysShared.value = kfs; })
        (updated.map(k => ({ ...k })));

      /* 2.3  Remember for the next session */
      latestMarkerKeyframesRef.current = updated.map(k => ({ ...k }));

      /* 2.4  Persist */
      try {
        await saveProject({ ...project, clips: nextClips });
        console.log('✅  persisted markerKeyframes');
      } catch (err) {
        console.warn('⚠️  failed to persist markerKeyframes', err);
      }

      /* 2.5  Tell the Video-editor there is now tracking data */
      setHasTracking(updated.length > 0);
    };

    /* -----------------------------------------------------------
    * 3️⃣  Finally navigate
    * -----------------------------------------------------------
    */
    navigation.navigate('SmartTracking', {
      project,
      clip:        currentClip,
      videoUri:    currentClip?.uri,
      trimStart,
      trimEnd,
      duration,
      aspectRatio,
      markerKeyframes: initial,   
      startInEdit: true,
      spotlightMode: SPOTLIGHT_MODES.GUIDED,   
    });
  };

  const handlePlayerSpotlight = (mode) => {
    /* If the user picked Guided Follow, just reuse the rock-solid
     handleSmartTracking() flow – it already wires up the callback
     and persistence logic. */
    if (mode === SPOTLIGHT_MODES.GUIDED) {
      handleSmartTracking();
      return;         
    }

    const initial = collectInitialMarkerKeyframes();   

    /* -----------------------------------------------------------
    * Set up the callback for Intro Spotlight mode
    * -----------------------------------------------------------
    */
    trackingCallbackRef.current = async (data, spotlightMode) => {
      console.log('🎯 Intro Spotlight callback called with:', JSON.stringify(data), 'mode:', spotlightMode);
      
      // Handle different data formats
      let markerKeyframes;
      if (data && data.markerKeyframes) {
        // Intro mode: data is { markerKeyframes: [...], zoomKeyframes: [...] }
        markerKeyframes = data.markerKeyframes;
        console.log('🎯 Intro mode - using markerKeyframes:', JSON.stringify(markerKeyframes));
      } else if (Array.isArray(data)) {
        // Guided mode: data is just the array
        markerKeyframes = data;
        console.log('🎯 Guided mode - using data array:', JSON.stringify(markerKeyframes));
      } else {
        console.error('🎯 Unknown data format:', data);
        return;
      }

      /* 2.1  Update React state */
      const nextClips = [...clips];
      nextClips[currentIndex] = {
        ...nextClips[currentIndex],
        markerKeyframes: markerKeyframes,
        spotlightMode: spotlightMode,  
      };
      setClips(nextClips);
      setSpotlightMode(spotlightMode);
      saveProject({ ...project, clips: nextClips }).catch(console.warn);

      /* 2.2  Update shared value -> canvas refresh happens instantly */
      runOnUI(kfs => { overlaysShared.value = kfs; })
        (markerKeyframes.map(k => ({ ...k })));

      /* 2.3  Remember for the next session */
      latestMarkerKeyframesRef.current = markerKeyframes.map(k => ({ ...k }));

      /* 2.4  Persist */
      try {
        await saveProject({ ...project, clips: nextClips });
        console.log('✅ persisted markerKeyframes');
      } catch (err) {
        console.warn('⚠️ failed to persist markerKeyframes', err);
      }

      /* 2.5  Tell the Video-editor there is now tracking data */
      setHasTracking(markerKeyframes.length > 0);
    };

    navigation.navigate('SmartTracking', {
      project,
      clip: currentClip,
      trimStart,
      trimEnd,
      aspectRatio,
      markerKeyframes: initial,
      spotlightMode: mode,         
      startInEdit: false
    });
  };

  const logVideoFileDetails = async (uri) => {
    // console.log('[SmartZoom] Attempting to load video:', uri);

    try {
      const exists = await RNFS.exists(uri);

      if (exists) {
        const stat = await RNFS.stat(uri);
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
                overlays={effectiveOverlaysShared}
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
                // Spotlight effect props
                spotlightMode={spotlightMode}
                spotlightData={currentClip?.markerKeyframes || []}
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
              <TouchableOpacity onPress={handlePlayPause} style={styles.playPauseButton}>
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
              onPress={async () => {
                setAspectRatio(option);
                try {
                  await saveProject({ aspectRatio: option });
                } catch (err) {
                  console.warn('⚠️  failed to persist aspectRatio', err);
                }
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

        {/* Player Spotlight Control */}
        <View style={styles.toggleRow}>
        {/* Left side: label + status stacked vertically */}
        <View style={{ flexDirection: 'column' }}>
          <Text style={styles.subtitle}>Player Spotlight:</Text>

          {/* TEMPORARILY DISABLED: Only show configured status for Intro Spotlight, hide Guided Follow */}
          {/* TEMPORARILY DISABLED: Configured text - will be shown later */}
          {/* {spotlightMode === SPOTLIGHT_MODES.INTRO && (
            <Text style={{ color: '#aaa', fontSize: 12, marginTop: 2 }}>
              Configured
            </Text>
          )} */}
          {/* TEMPORARILY DISABLED: Guided Follow status - code preserved for future re-enabling */}
          {/* {spotlightMode === SPOTLIGHT_MODES.GUIDED && (
            <Text style={{ color: '#aaa', fontSize: 12, marginTop: 2 }}>
              Guided Follow configured
            </Text>
          )} */}
        </View>

        {/* Right side: buttons or setup */}
        {/* TEMPORARILY DISABLED: Only handle Intro Spotlight, Guided Follow disabled */}
        {spotlightMode === SPOTLIGHT_MODES.INTRO ? (
          /* ---- Already configured ---- */
          <View style={styles.actionGroup}>
            {/* Edit */}
            <TouchableOpacity
              onPress={() =>
                // TEMPORARILY DISABLED: Only handle Intro Spotlight re-edit
                handlePlayerSpotlight(SPOTLIGHT_MODES.INTRO)
                // TEMPORARILY DISABLED: Guided Follow edit - code preserved for future re-enabling
                // spotlightMode === SPOTLIGHT_MODES.GUIDED
                //   ? handleSmartTracking([...overlaysShared.value])
                //   : handlePlayerSpotlight(SPOTLIGHT_MODES.INTRO)
              }
              style={styles.secondaryButton}
            >
              <Text style={styles.buttonText}>Edit</Text>
            </TouchableOpacity>

            {/* Reset */}
            <TouchableOpacity
              onPress={async () => {
                // TEMPORARILY DISABLED: Only reset Intro Spotlight, Guided Follow logic preserved for future re-enabling
                const updated = [...clips];
                updated[currentIndex] = {
                  ...updated[currentIndex],
                  markerKeyframes: [],
                  introSpotlight: null,
                  spotlightMode: null,
                };
                setClips(updated);
                overlaysShared.value = [];
                setHasTracking(false);
                setSpotlightMode(null);
                latestMarkerKeyframesRef.current = [];

                try {
                  await saveProject({ ...project, clips: updated });
                } catch (err) {
                  console.warn('⚠️  failed to persist spotlight reset', err);
                }
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.buttonText}>Reset</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ---- Nothing configured yet ---- */
          /* TEMPORARILY DISABLED: Guided Follow option hidden, auto-select Intro Spotlight */
          <TouchableOpacity
            onPress={() => handlePlayerSpotlight(SPOTLIGHT_MODES.INTRO)}
            style={styles.primaryButton}
          >
            <Text style={styles.buttonText}>Set Up</Text>
          </TouchableOpacity>
        )}
      </View>

        {/* ──────────────────────────────────────────────── */}
        <Modal visible={spotlightModalOpen} transparent animationType="fade">
          {/* Dim backdrop */}
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setSpotlightModalOpen(false)}
          />
          {/* Action sheet */}
          <View style={styles.spotlightSheet}>
            {/* TEMPORARILY DISABLED: Guided Follow option hidden, only Intro Spotlight available */}
            {[
              {
                label: 'Intro Spotlight',
                mode: SPOTLIGHT_MODES.INTRO,
                subtitle: 'Best for quick plays. Freeze the frame and point out who to watch.',
              },
              // TEMPORARILY DISABLED: Guided Follow option - code preserved for future re-enabling
              // {
              //   label: 'Guided Follow',
              //   mode: SPOTLIGHT_MODES.GUIDED,
              //   subtitle: 'Track the athlete across the clip by placing markers on key frames.',
              // },
            ].map(({ label, mode, subtitle }) => (
              <TouchableOpacity
                key={mode}
                onPress={() => {
                  setSpotlightModalOpen(false);
                  handlePlayerSpotlight(mode);     // 🆕 helper below 
                }}
                style={styles.sheetRow}
              >
                <Text style={styles.sheetTitle}>{label}</Text>
                <Text style={styles.sheetSub}>{subtitle}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Modal>

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
  backdrop: { 
    flex:1, 
    backgroundColor:'rgba(0,0,0,0.4)' 
  },
  spotlightSheet: {
    position:'absolute', bottom:0, left:0, right:0,
    backgroundColor:'#222', paddingVertical:12, paddingHorizontal:16,
    borderTopLeftRadius:12, borderTopRightRadius:12,
  },
  sheetRow:{ 
    paddingVertical:12 
  },
  sheetTitle:{ 
    color:'#fff', 
    fontSize:16, 
    fontWeight:'600' 
  },
  sheetSub:{ 
    color:'#aaa', 
    fontSize:12 
  },
});