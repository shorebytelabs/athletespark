// import React from 'react';
// import { SafeAreaView, StatusBar } from 'react-native';
// import AppNavigator from './src/navigation/AppNavigator';
// import { ActionSheetProvider } from '@expo/react-native-action-sheet';

// export default function App() {
//   return (
//     <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
//       <StatusBar barStyle="dark-content" />
//       <AppNavigator />
//     </SafeAreaView>
//   );
// }
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ActionSheetProvider>
        <AppNavigator />
      </ActionSheetProvider>
    </GestureHandlerRootView>
  );
}