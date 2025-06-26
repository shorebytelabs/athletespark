// /src/screens/VideoEditor/SmartTrackingScreen.js

// import React, { useEffect, useRef, useState } from 'react';
import React from 'react';
import { View, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import SmartTrackingEditor from '../../components/SmartTrackingEditor';
import { trackingCallbackRef } from '../../utils/trackingCallbackRegistry';
import { runOnUI } from 'react-native-reanimated';

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

  const handleFinish = (finalKeyframes) => {
    // Send the edits back to Video-Editor
    if (trackingCallbackRef.current) {
        trackingCallbackRef.current(finalKeyframes);
        trackingCallbackRef.current = null;
    }
    console.log(
        '📥 Received keyframes in SmartTrackingScreen:',
        JSON.stringify(finalKeyframes),
    );

    // Return to the Video-Editor screen
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
          markerKeyframes={markerKeyframes}  
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
