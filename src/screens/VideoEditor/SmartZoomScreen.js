import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import SmartZoomEditor from '../../components/SmartZoomEditor';

const SmartZoomScreen = ({ route, navigation }) => {
  const { videoUri, trimStart, trimEnd, duration, clipIndex } = route.params || {};
  const [validData, setValidData] = useState(false);

  useEffect(() => {
    if (!videoUri || trimStart == null || trimEnd == null || duration == null || clipIndex == null) {
      Alert.alert('Missing data', 'No clip selected or clip is missing data');
      navigation.goBack();
    } else {
      setValidData(true);
    }
  }, [videoUri, trimStart, trimEnd, duration, clipIndex]);

  const handleComplete = (keyframes) => {
    navigation.navigate('VideoEditor', {
      updatedSmartZoom: {
        clipIndex,
        keyframes,
      },
    });
  };

  const handleCancel = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      {validData && (
        <SmartZoomEditor
            videoUri={videoUri}
            trimStart={trimStart}
            trimEnd={trimEnd}
            duration={duration}
            onComplete={(keyframes) => {
                navigation.navigate('VideoEditor', {
                updatedSmartZoom: { clipIndex, keyframes }
                });
            }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
});

export default SmartZoomScreen;
