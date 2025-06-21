// src/screens/VideoEditor/SmartTrackingScreen.js
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import SmartTrackingEditor from '../../components/SmartTrackingEditor';

const SmartTrackingScreen = ({ route, navigation }) => {
  const {
    videoUri,
    trimStart,
    trimEnd,
    duration,
    clipIndex,
    project,
    aspectRatio,
    existingKeyframes,
  } = route.params || {};

  const [validData, setValidData] = useState(false);

  useEffect(() => {
    const isValid =
      typeof videoUri === 'string' &&
      typeof trimStart === 'number' &&
      typeof trimEnd === 'number' &&
      typeof duration === 'number' &&
      typeof clipIndex === 'number' &&
      typeof aspectRatio === 'object' &&
      aspectRatio !== null &&
      typeof aspectRatio.ratio === 'number';

    if (!isValid) {
      Alert.alert(
        'Missing data',
        'No clip selected or clip is missing required information.'
      );
      navigation.goBack();
    } else {
      setValidData(true);
    }
  }, [videoUri, trimStart, trimEnd, duration, clipIndex, aspectRatio]);

  const handleComplete = (keyframes) => {
    navigation.navigate({
      name: 'VideoEditor',
      params: {
        updatedSmartTracking: {
          project,
          clipIndex,
          keyframes,
        },
      },
      merge: true,
    });
  };

  return (
    <View style={styles.container}>
      {validData && (
        <SmartTrackingEditor
          videoUri={videoUri}
          trimStart={trimStart}
          trimEnd={trimEnd}
          duration={duration}
          onComplete={handleComplete}
          aspectRatio={aspectRatio}
          existingKeyframes={existingKeyframes}
          project={project}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
});

export default SmartTrackingScreen;
