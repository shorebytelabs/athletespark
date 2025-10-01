// /src/screens/VideoEditor/SmartTrackingScreen.js

// import React, { useEffect, useRef, useState } from 'react';
import React from 'react';
import { View, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import SmartTrackingEditor from '../../components/SmartTrackingEditor';
import { trackingCallbackRef } from '../../utils/trackingCallbackRegistry';
import { SPOTLIGHT_MODES } from '../../constants/playerSpotlight'; 

const SmartTrackingScreen = ({ route, navigation }) => {
  const {
    clip,
    trimStart,
    trimEnd,
    aspectRatio,
    smartZoomKeyframes, // may affect transform playback
    markerKeyframes = [], // initial marker overlay keyframes if editing
    // TEMPORARILY DISABLED: Default to GUIDED but will be overridden by Intro Spotlight calls
    spotlightMode = SPOTLIGHT_MODES.GUIDED,   
    onTrackingComplete, // callback to receive final keyframes
  } = route.params || {};

  const handleFinish = (data) => {
    console.log('📥 Received data in SmartTrackingScreen:', JSON.stringify(data));
    console.log('📥 spotlightMode:', spotlightMode);
    
    // Send the edits back to Video-Editor
    if (trackingCallbackRef.current) {
        trackingCallbackRef.current(data, spotlightMode);
        console.log('📤 trackingCallbackRef called successfully');
    } else {
        console.log('❌ trackingCallbackRef.current is null!');
    }

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
          spotlightMode={spotlightMode}       
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
