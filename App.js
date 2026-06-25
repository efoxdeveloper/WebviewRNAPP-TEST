import { StatusBar } from 'expo-status-bar';
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const DEFAULT_URL = 'https://betaschoolmobileapp.efoxtechnologies.com/?schoolid=jblschool';
const EXIT_ROUTE_PATHS = ['/', '/home'];
const EXIT_PRESS_DELAY_MS = 2000;
const SPLASH_MIN_DURATION_MS = 2000;
const SLOW_LOAD_DELAY_MS = 8000;
const INTERNET_BACK_VISIBLE_MS = 2500;
const EXIT_ROUTE_PREFIXES = [];
const DOWNLOAD_FILE_PATTERN =
  /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|csv|txt|png|jpe?g|webp|gif|mp4|mov|mp3|wav)(\?.*)?$/i;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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

function resolveWebViewUrl(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('/')) {
    return new URL(trimmed, DEFAULT_URL).toString();
  }

  try {
    const parsedUrl = new URL(trimmed);
    const route = `/${[parsedUrl.hostname, parsedUrl.pathname]
      .join('/')
      .replace(/\/+/g, '/')
      .replace(/^\/+|\/+$/g, '')}`;
    return new URL(route, DEFAULT_URL).toString();
  } catch {
    return normalizeUrl(trimmed);
  }
}

function getUrlPath(value) {
  try {
    return new URL(value).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '/';
  }
}

function isDownloadUrl(value) {
  return DOWNLOAD_FILE_PATTERN.test(value);
}

function logSlowInternetBanner(reason, details = {}) {
  console.log('Showing slow internet banner:', {
    message: 'Slow internet connection, please wait',
    reason,
    ...details,
  });
}

async function registerForPushNotificationsAsync() {
  const projectId =
    Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;

  if (!projectId) {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0b63ce',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Notification permission was not granted.');
    return null;
  }

  const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
  console.log('Expo push token:', pushToken.data);
  return pushToken.data;
}

function WebViewApp() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef(null);
  const lastBackPressRef = useRef(0);
  const canGoBackRef = useRef(false);
  const currentUrlRef = useRef(DEFAULT_URL);
  const splashTimerDoneRef = useRef(false);
  const firstNavigationFinishedRef = useRef(false);
  const hadConnectionWarningRef = useRef(false);
  const slowLoadWarningRef = useRef(false);
  const loadErrorRef = useRef(null);
  const slowLoadTimerRef = useRef(null);
  const internetBackTimerRef = useRef(null);

  const [activeUrl, setActiveUrl] = useState(DEFAULT_URL);
  const [isLoading, setIsLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [networkBanner, setNetworkBanner] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loadProgress, setLoadProgress] = useState(0);

  const openUrlInWebView = (value) => {
    const nextUrl = resolveWebViewUrl(value);

    if (!nextUrl) {
      return;
    }

    currentUrlRef.current = nextUrl;
    loadErrorRef.current = null;
    setLoadError(null);
    setActiveUrl(nextUrl);
  };

  const isExitRoute = (value) => {
    const currentPath = getUrlPath(value);
    return (
      EXIT_ROUTE_PATHS.includes(currentPath) ||
      EXIT_ROUTE_PREFIXES.some((prefix) => currentPath.startsWith(prefix))
    );
  };

  const maybeHideSplash = () => {
    if (splashTimerDoneRef.current && firstNavigationFinishedRef.current) {
      setShowSplash(false);
    }
  };

  const clearSlowLoadTimer = () => {
    if (slowLoadTimerRef.current) {
      clearTimeout(slowLoadTimerRef.current);
      slowLoadTimerRef.current = null;
    }
  };

  const clearInternetBackTimer = () => {
    if (internetBackTimerRef.current) {
      clearTimeout(internetBackTimerRef.current);
      internetBackTimerRef.current = null;
    }
  };

  const showInternetBackBanner = () => {
    setNetworkBanner({ message: 'Internet back', type: 'online' });
    hadConnectionWarningRef.current = false;
    clearInternetBackTimer();
    internetBackTimerRef.current = setTimeout(() => {
      setNetworkBanner(null);
      internetBackTimerRef.current = null;
    }, INTERNET_BACK_VISIBLE_MS);
  };

  const retryCurrentPage = () => {
    loadErrorRef.current = null;
    setLoadError(null);

    if (webViewRef.current) {
      webViewRef.current.reload();
      return;
    }

    setActiveUrl(currentUrlRef.current);
  };

  const openOutsideApp = async (url) => {
    try {
      const canOpen = await Linking.canOpenURL(url);

      if (canOpen) {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.log('Unable to open URL outside app:', error);
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
    registerForPushNotificationsAsync().catch((error) => {
      console.log('Push notification registration failed:', error);
    });
  }, []);

  useEffect(() => {
    const openFromNotification = (notification) => {
      const url = notification?.request?.content?.data?.url;

      if (typeof url === 'string') {
        openUrlInWebView(url);
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) {
        openUrlInWebView(url);
      }
    });

    const lastNotificationResponse = Notifications.getLastNotificationResponse();
    if (lastNotificationResponse?.notification) {
      openFromNotification(lastNotificationResponse.notification);
    }

    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      openUrlInWebView(url);
    });

    const notificationSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        openFromNotification(response.notification);
      });

    return () => {
      linkingSubscription.remove();
      notificationSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOffline =
        state.isConnected === false || state.isInternetReachable === false;
      const isSlowConnection =
        state.details?.cellularGeneration === '2g' ||
        state.details?.cellularGeneration === '3g' ||
        state.details?.isConnectionExpensive === true;

      if (isOffline) {
        clearInternetBackTimer();
        hadConnectionWarningRef.current = true;
        setNetworkBanner({ message: 'No internet connection', type: 'offline' });
        return;
      }

      if (isSlowConnection) {
        clearInternetBackTimer();
        hadConnectionWarningRef.current = true;
        logSlowInternetBanner('netinfo_slow_connection', {
          cellularGeneration: state.details?.cellularGeneration ?? null,
          isConnectionExpensive: state.details?.isConnectionExpensive ?? null,
          type: state.type,
        });
        setNetworkBanner({
          message: 'Slow internet connection, please wait',
          type: 'slow',
        });
        return;
      }

      if (hadConnectionWarningRef.current) {
        showInternetBackBanner();
        return;
      }

      setNetworkBanner(null);
    });

    return () => {
      unsubscribe();
      clearSlowLoadTimer();
      clearInternetBackTimer();
    };
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

      if (loadErrorRef.current) {
        retryCurrentPage();
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
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.container}>
      <StatusBar style={showSplash ? 'light' : 'dark'} />
      <View style={styles.webviewShell}>
        {loadProgress > 0 && loadProgress < 1 && !showSplash ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${loadProgress * 100}%` }]} />
          </View>
        ) : null}

        {isLoading && !showSplash ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#0f766e" size="large" />
          </View>
        ) : null}

        <WebView
          allowsInlineMediaPlayback
          allowsBackForwardNavigationGestures
          androidLayerType="hardware"
          bounces={false}
          domStorageEnabled
          javaScriptEnabled
          key={activeUrl}
          mediaPlaybackRequiresUserAction={false}
          mixedContentMode="compatibility"
          overScrollMode="never"
          pullToRefreshEnabled={false}
          ref={webViewRef}
          onFileDownload={({ nativeEvent }) => {
            openOutsideApp(nativeEvent.downloadUrl);
          }}
          onError={({ nativeEvent }) => {
            clearSlowLoadTimer();
            setLoadError({
              description: nativeEvent.description || 'Unable to load this page.',
              url: nativeEvent.url || activeUrl,
            });
            loadErrorRef.current = {
              description: nativeEvent.description || 'Unable to load this page.',
              url: nativeEvent.url || activeUrl,
            };
            setIsLoading(false);
            setLoadProgress(0);
            firstNavigationFinishedRef.current = true;
            maybeHideSplash();
          }}
          onLoadEnd={() => {
            clearSlowLoadTimer();
            setIsLoading(false);
            setLoadProgress(1);
            firstNavigationFinishedRef.current = true;
            if (slowLoadWarningRef.current) {
              slowLoadWarningRef.current = false;
              showInternetBackBanner();
            }
            maybeHideSplash();
          }}
          onLoadStart={() => {
            clearSlowLoadTimer();
            slowLoadWarningRef.current = false;
            loadErrorRef.current = null;
            setLoadError(null);
            setLoadProgress(0.08);
            setIsLoading(true);
            slowLoadTimerRef.current = setTimeout(() => {
              hadConnectionWarningRef.current = true;
              slowLoadWarningRef.current = true;
              logSlowInternetBanner('page_load_timeout', {
                timeoutMs: SLOW_LOAD_DELAY_MS,
                url: currentUrlRef.current,
              });
              setNetworkBanner({
                message: 'Slow internet connection, please wait',
                type: 'slow',
              });
            }, SLOW_LOAD_DELAY_MS);
          }}
          onNavigationStateChange={(navState) => {
            canGoBackRef.current = navState.canGoBack;
            currentUrlRef.current = navState.url;
          }}
          onLoadProgress={({ nativeEvent }) => {
            setLoadProgress(nativeEvent.progress);
          }}
          onShouldStartLoadWithRequest={(request) => {
            const { url } = request;

            if (!/^https?:\/\//i.test(url)) {
              openOutsideApp(url);
              return false;
            }

            if (isDownloadUrl(url)) {
              openOutsideApp(url);
              return false;
            }

            return true;
          }}
          source={{ uri: activeUrl }}
          startInLoadingState
          style={styles.webview}
        />

        {loadError && !showSplash ? (
          <View
            style={[
              styles.errorOverlay,
              { paddingBottom: Math.max(insets.bottom, 24) },
            ]}
          >
            <Text style={styles.errorTitle}>Page could not load</Text>
            <Text style={styles.errorDescription}>{loadError.description}</Text>
            <Pressable onPress={retryCurrentPage} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {networkBanner && !showSplash ? (
          <View style={[styles.networkBanner, styles[`${networkBanner.type}Banner`]]}>
            <Text style={styles.networkBannerText}>{networkBanner.message}</Text>
          </View>
        ) : null}
      </View>

      {showSplash ? (
        <View
          style={[
            styles.splash,
            {
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
              paddingLeft: insets.left,
              paddingRight: insets.right,
            },
          ]}
        >
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

export default function App() {
  return (
    <SafeAreaProvider>
      <WebViewApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  webviewShell: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webview: {
    flex: 1,
  },
  progressTrack: {
    position: 'absolute',
    zIndex: 3,
    top: 0,
    right: 0,
    left: 0,
    height: 3,
    backgroundColor: 'rgba(15, 118, 110, 0.16)',
  },
  progressFill: {
    height: 3,
    backgroundColor: '#0f766e',
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
  networkBanner: {
    position: 'absolute',
    zIndex: 2,
    top: 0,
    right: 0,
    left: 0,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  networkBannerText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  offlineBanner: {
    backgroundColor: '#111827',
  },
  slowBanner: {
    backgroundColor: '#111827',
  },
  onlineBanner: {
    backgroundColor: '#0f766e',
  },
  errorOverlay: {
    position: 'absolute',
    zIndex: 4,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 24,
    backgroundColor: '#ffffff',
  },
  errorTitle: {
    color: '#10212a',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorDescription: {
    color: '#52636d',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 46,
    minWidth: 116,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#0f766e',
    paddingHorizontal: 18,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
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
