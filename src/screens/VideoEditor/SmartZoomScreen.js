import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import SmartZoomEditor from '../../components/SmartZoomEditor';

const SmartZoomScreen = ({ route, navigation }) => {
  const { videoUri, trimStart, trimEnd, duration, clipIndex, project } = route.params || {};
  const [validData, setValidData] = useState(false);

  useEffect(() => {
    const isValid =
      typeof videoUri === 'string' &&
      typeof trimStart === 'number' &&
      typeof trimEnd === 'number' &&
      typeof duration === 'number' &&
      typeof clipIndex === 'number';

    if (!isValid) {
      Alert.alert('Missing data', 'No clip selected or clip is missing required information.');
      navigation.goBack();
    } else {
      setValidData(true);
    }
  }, [videoUri, trimStart, trimEnd, duration, clipIndex]);

  const handleComplete = (keyframes) => {
    navigation.navigate({
      name: 'VideoEditor',
      params: {
        updatedSmartZoom: {
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
        <SmartZoomEditor
          videoUri={videoUri}
          trimStart={trimStart}
          trimEnd={trimEnd}
          duration={duration}
          onComplete={handleComplete}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
});

export default SmartZoomScreen;
