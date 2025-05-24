import React from 'react';
import { View, Text } from 'react-native';
import MultiSlider from '@ptomasroos/react-native-multi-slider';

const TrimSlider = ({ duration, trimStart, trimEnd, onTrimChange, setPaused }) => {
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
        selectedStyle={{ backgroundColor: '#4a90e2' }}
        unselectedStyle={{ backgroundColor: '#ccc' }}
        containerStyle={{ height: 40 }}
        trackStyle={{ height: 6 }}
        markerStyle={{
          height: 20,
          width: 20,
          borderRadius: 10,
          backgroundColor: '#fff',
          borderWidth: 2,
          borderColor: '#4a90e2',
        }}
        customMarker={({ currentValue }) => (
          <View style={{ alignItems: 'center' }}>
            <View style={{
              backgroundColor: '#4a90e2',
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
              backgroundColor: '#fff',
              borderWidth: 2,
              borderColor: '#4a90e2',
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
        <Text style={{ fontSize: 10 }}>0.0s</Text>
        <Text style={{ fontSize: 10 }}>{duration.toFixed(1)}s</Text>
      </View>
    </View>
  );
};

export default TrimSlider;
