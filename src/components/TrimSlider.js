import React from 'react';
import { View, Text } from 'react-native';
import MultiSlider from '@ptomasroos/react-native-multi-slider';

const TrimSlider = ({
  duration,
  trimStart,
  trimEnd,
  onTrimChange,
  setPaused,
  minimumTrackTintColor = '#4a90e2',   // fallback colors if not provided
  maximumTrackTintColor = '#ccc',
  thumbTintColor = '#fff',
}) => {
  return (
    <View style={{ alignItems: 'center', marginVertical: 20 }}>
      <MultiSlider
        values={[trimStart, trimEnd]}
        min={0}
        max={duration}
        step={0.1}
        sliderLength={300}
        onValuesChangeStart={() => {
          setPaused(true);
        }}
        onValuesChange={(values) => {
          onTrimChange(values[0], values[1]);
        }}
        selectedStyle={{ backgroundColor: minimumTrackTintColor }}
        unselectedStyle={{ backgroundColor: maximumTrackTintColor }}
        containerStyle={{ height: 40 }}
        trackStyle={{ height: 6 }}
        markerStyle={{
          height: 20,
          width: 20,
          borderRadius: 10,
          backgroundColor: thumbTintColor,
          borderWidth: 2,
          borderColor: minimumTrackTintColor,
        }}
        customMarker={({ currentValue }) => (
          <View style={{ alignItems: 'center' }}>
            <View style={{
              backgroundColor: minimumTrackTintColor,
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
              marginBottom: 4,
            }}>
              <Text style={{ color: '#fff', fontSize: 10 }}>
                {(typeof currentValue === 'number' && !isNaN(currentValue) ? currentValue : 0).toFixed(1)}s
              </Text>
            </View>
            <View style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: thumbTintColor,
              borderWidth: 2,
              borderColor: minimumTrackTintColor,
            }} />
          </View>
        )}
      />

      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: 300,
        marginTop: 4,
      }}>
        <Text style={{ fontSize: 10, color: minimumTrackTintColor }}>0.0s</Text>
        <Text style={{ fontSize: 10, color: minimumTrackTintColor }}>{duration.toFixed(1)}s</Text>
      </View>
    </View>
  );
};

export default TrimSlider;
