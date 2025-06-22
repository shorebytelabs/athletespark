// /src/screens/VideoEditor/SmartTrackingScreen.js

import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import SmartTrackingEditor from '../../components/SmartTrackingEditor';
import { trackingCallbackRef } from '../../utils/trackingCallbackRegistry';

const SmartTrackingScreen = ({ route, navigation }) => {
  const {
    clip,
    trimStart,
    trimEnd,
    aspectRatio,
    smartZoomKeyframes, // may affect transform playback
    markerKeyframes = [], // initial marker overlay keyframes if editing
    onTrackingComplete, // callback to receive final keyframes
  } = route.params || {};

  const [currentKeyframes, setCurrentKeyframes] = useState(markerKeyframes);

  const handleFinish = (finalKeyframes) => {
    setCurrentKeyframes(finalKeyframes);

    if (trackingCallbackRef.current) {
        trackingCallbackRef.current(finalKeyframes);
        trackingCallbackRef.current = null; 
    }

    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <SmartTrackingEditor
          clip={clip}
          trimStart={trimStart}
          trimEnd={trimEnd}
          aspectRatio={aspectRatio}
          smartZoomKeyframes={smartZoomKeyframes}
          markerKeyframes={currentKeyframes}
          onFinish={handleFinish}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});

export default SmartTrackingScreen;
