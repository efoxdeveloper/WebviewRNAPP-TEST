import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Keyboard,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

const DEFAULT_URL = 'https://expo.dev';
const EXIT_ROUTE_PATHS = ['/', '/home'];
const EXIT_PRESS_DELAY_MS = 2000;
const SPLASH_MIN_DURATION_MS = 2000;

function normalizeUrl(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

export default function App() {
  const webViewRef = useRef(null);
  const lastBackPressRef = useRef(0);
  const canGoBackRef = useRef(false);
  const currentUrlRef = useRef(DEFAULT_URL);
  const splashTimerDoneRef = useRef(false);
  const firstNavigationFinishedRef = useRef(false);

  const [urlText, setUrlText] = useState(DEFAULT_URL);
  const [activeUrl, setActiveUrl] = useState(DEFAULT_URL);
  const [isLoading, setIsLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const canLoad = useMemo(() => normalizeUrl(urlText).length > 0, [urlText]);

  const loadUrl = () => {
    const nextUrl = normalizeUrl(urlText);

    if (!nextUrl) {
      setErrorMessage('Enter a URL to load.');
      return;
    }

    Keyboard.dismiss();
    setErrorMessage('');
    setActiveUrl(nextUrl);
    setUrlText(nextUrl);
  };

  const isExitRoute = (value) => {
    try {
      const currentPath = new URL(value).pathname.replace(/\/+$/, '') || '/';
      return EXIT_ROUTE_PATHS.includes(currentPath);
    } catch {
      return false;
    }
  };

  const maybeHideSplash = () => {
    if (splashTimerDoneRef.current && firstNavigationFinishedRef.current) {
      setShowSplash(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      splashTimerDoneRef.current = true;
      maybeHideSplash();
    }, SPLASH_MIN_DURATION_MS);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isExitRoute(currentUrlRef.current)) {
        const now = Date.now();

        if (now - lastBackPressRef.current < EXIT_PRESS_DELAY_MS) {
          BackHandler.exitApp();
          return true;
        }

        lastBackPressRef.current = now;
        ToastAndroid.show('Press back again to close the app', ToastAndroid.SHORT);
        return true;
      }

      if (canGoBackRef.current && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }

      return false;
    });

    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style={showSplash ? 'light' : 'dark'} />

      <View style={styles.toolbar}>
        <Text style={styles.title}>WebView Loader</Text>

        <View style={styles.urlRow}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            keyboardType="url"
            onChangeText={setUrlText}
            onSubmitEditing={loadUrl}
            placeholder="https://example.com"
            returnKeyType="go"
            style={styles.input}
            value={urlText}
          />

          <Pressable
            disabled={!canLoad}
            onPress={loadUrl}
            style={({ pressed }) => [
              styles.button,
              !canLoad && styles.buttonDisabled,
              pressed && canLoad && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>Load</Text>
          </Pressable>
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>

      <View style={styles.webviewShell}>
        {isLoading && !showSplash ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#0f766e" size="large" />
          </View>
        ) : null}

        <WebView
          key={activeUrl}
          ref={webViewRef}
          onError={({ nativeEvent }) => {
            setErrorMessage(nativeEvent.description || 'Unable to load this URL.');
            setIsLoading(false);
            firstNavigationFinishedRef.current = true;
            maybeHideSplash();
          }}
          onLoadEnd={() => {
            setIsLoading(false);
            firstNavigationFinishedRef.current = true;
            maybeHideSplash();
          }}
          onLoadStart={() => {
            setErrorMessage('');
            setIsLoading(true);
          }}
          onNavigationStateChange={(navState) => {
            canGoBackRef.current = navState.canGoBack;
            currentUrlRef.current = navState.url;
          }}
          source={{ uri: activeUrl }}
          startInLoadingState
          style={styles.webview}
        />
      </View>

      {showSplash ? (
        <View style={styles.splash}>
          <Image
            resizeMode="contain"
            source={require('./assets/icon.png')}
            style={styles.splashIcon}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  toolbar: {
    gap: 12,
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomColor: '#dbe4ea',
    borderBottomWidth: 1,
  },
  title: {
    color: '#10212a',
    fontSize: 20,
    fontWeight: '700',
  },
  urlRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 46,
    borderColor: '#c8d3da',
    borderRadius: 8,
    borderWidth: 1,
    color: '#10212a',
    fontSize: 16,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
  },
  button: {
    minHeight: 46,
    minWidth: 78,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#0f766e',
    paddingHorizontal: 16,
  },
  buttonDisabled: {
    backgroundColor: '#8fb8b4',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
  },
  webviewShell: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    zIndex: 1,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
  },
  splash: {
    position: 'absolute',
    zIndex: 10,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b63ce',
  },
  splashIcon: {
    width: 112,
    height: 112,
  },
});
