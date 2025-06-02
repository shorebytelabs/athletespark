import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import SmartZoomEditor from '../../components/SmartZoomEditor';

const SmartZoomScreen = ({ route, navigation }) => {
  const { videoUri, trimStart, trimEnd, duration, clipIndex, project } = route.params || {};
  const [validData, setValidData] = useState(false);

  useEffect(() => {
    if (!videoUri || trimStart == null || trimEnd == null || duration == null || clipIndex == null) {
      Alert.alert('Missing data', 'No clip selected or clip is missing data');
      navigation.goBack(updatedClip,);
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

  const handleCancel = () => {
    navigation.goBack(updatedClip,);
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
