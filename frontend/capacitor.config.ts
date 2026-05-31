import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.casemoney.app',
  appName: 'CaseMoney',
  webDir: 'dist',
  // server.androidScheme = https — без него на Android live-reload и куки работают как с file://
  server: {
    androidScheme: 'https',
  },
  android: {
    // allowMixedContent: false — все запросы из приложения должны быть HTTPS
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: '#f6f2e9', // paper
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT', // light icons over ink-navy
      backgroundColor: '#173a54',
    },
  },
};

export default config;
