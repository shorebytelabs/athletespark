import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const AthleteProfilesScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Athlete Profiles</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 20 }
});

export default AthleteProfilesScreen;
