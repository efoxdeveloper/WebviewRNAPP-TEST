import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Image,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { StorageAccessFramework } from "expo-file-system/legacy";
import * as Notifications from "expo-notifications";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

const SCHOOL_URL = "https://androidhpschoolapp.inventive.in/Login/jblschool";
const VERSION_API = {
  ios: "https://appversion.edufox.net/api/version/jblschoolIOS",
  android: "https://appversion.edufox.net/api/version/jblschoolAndroid",
};
const DOWNLOAD_EXTENSIONS = /\.(pdf|docx?|xlsx?|pptx|zip|rar|apk|csv|txt|mp3|mp4|m4a)$/i;
const DOWNLOAD_EXTENSIONS_FOR_WEB = "\\.(pdf|docx?|xlsx?|pptx|zip|rar|apk|csv|txt|mp3|mp4|m4a)(\\?.*)?$";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotificationsAsync() {
  if (Platform.OS === "ios") {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      Alert.alert("Permission required", "Enable notifications from Settings to receive updates.");
      return null;
    }
  }

  return (await Notifications.getExpoPushTokenAsync()).data;
}

function compareVersions(a, b) {
  if (!a || !b) return 0;

  const normalize = value => value.split(/[+-]/)[0].trim();
  const left = normalize(a).split(".").map(part => parseInt(part, 10) || 0);
  const right = normalize(b).split(".").map(part => parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index] || 0;
    const rightPart = right[index] || 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

function getLastPathSegment(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    const noHash = String(url).split("#")[0];
    const noQuery = noHash.split("?")[0];
    const parts = noQuery.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  }
}

function isLikelyDownloadUrl(url) {
  if (!url) return false;
  return DOWNLOAD_EXTENSIONS.test(getLastPathSegment(url));
}

function isExternalAppUrl(url) {
  return Boolean(url && !/^https?:\/\//i.test(url));
}

function getDestinationDir() {
  return FileSystem.documentDirectory || FileSystem.cacheDirectory || "";
}

function extractFileNameFromUrl(url, fallbackName) {
  try {
    const cleanUrl = url.split("#")[0];
    const lastSegment = cleanUrl.split("/").pop() || "";
    return lastSegment.split("?")[0] || fallbackName || `file_${Date.now()}`;
  } catch {
    return fallbackName || `file_${Date.now()}`;
  }
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function guessMime(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const map = {
    apk: "application/vnd.android.package-archive",
    csv: "text/csv",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    pdf: "application/pdf",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    rar: "application/vnd.rar",
    txt: "text/plain",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    zip: "application/zip",
  };
  return map[ext] || "application/octet-stream";
}

function MainApp() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef(null);
  const activeDownloads = useRef(new Set());
  const webViewStartRef = useRef(null);
  const splashStartRef = useRef(null);

  const [showSplash, setShowSplash] = useState(true);
  const [webViewLoaded, setWebViewLoaded] = useState(false);
  const [splashMinimumReached, setSplashMinimumReached] = useState(false);
  const [splashMaxWaitReached, setSplashMaxWaitReached] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [showNoInternet, setShowNoInternet] = useState(false);
  const [lastBackPressed, setLastBackPressed] = useState(null);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [apkUrl, setApkUrl] = useState("");
  const [downloadsTreeUri, setDownloadsTreeUri] = useState(null);

  const isGestureNavigation = Platform.OS === "android" && insets.bottom >= 10;
  const dynamicBottomPadding = isGestureNavigation ? 0 : insets.bottom;

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        console.log("Expo Push Token:", token);
      }
    });
  }, []);

  useEffect(() => {
    const listener = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response?.notification?.request?.content?.data;
      if (data?.type === "Navigate" && data.url && webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          window.location.href = ${JSON.stringify(data.url)};
          true;
        `);
      }
    });

    return () => listener.remove();
  }, []);

  useEffect(() => {
    splashStartRef.current = Date.now();
    console.log("[Splash] Visible started at:", splashStartRef.current);

    const minTimer = setTimeout(() => {
      console.log("[Splash] Minimum visible time reached: 3000 ms (3.00 s)");
      setSplashMinimumReached(true);
    }, 3000);
    const maxTimer = setTimeout(() => {
      console.log("[Splash] Maximum wait reached: 10000 ms (10.00 s)");
      setSplashMaxWaitReached(true);
    }, 10000);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
  }, []);

  useEffect(() => {
    if (!showSplash) return;
    if ((splashMinimumReached && webViewLoaded) || splashMaxWaitReached) {
      const now = Date.now();
      const visibleMs = splashStartRef.current ? now - splashStartRef.current : 0;
      console.log(`[Splash] Hidden after ${visibleMs} ms (${(visibleMs / 1000).toFixed(2)} s)`);
      setShowSplash(false);
    }
  }, [showSplash, splashMinimumReached, splashMaxWaitReached, webViewLoaded]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(Boolean(state.isConnected));
      setShowNoInternet(!state.isConnected);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const onBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }

      const now = Date.now();
      if (lastBackPressed && now - lastBackPressed < 2000) {
        BackHandler.exitApp();
        return true;
      }

      setLastBackPressed(now);
      if (Platform.OS === "android") {
        ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
      }
      return true;
    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [canGoBack, lastBackPressed]);

  useEffect(() => {
    const checkAppVersion = async () => {
      try {
        const response = await fetch(Platform.OS === "ios" ? VERSION_API.ios : VERSION_API.android);
        const versionData = await response.json();
        const requiredVersion = `${versionData.VersionName || ""}`;
        const currentVersion = `${Constants.expoConfig?.version || Constants.manifest?.version || ""}`;

        setApkUrl(versionData.ApkUrl || "");
        if (currentVersion && requiredVersion) {
          setForceUpdate(compareVersions(currentVersion, requiredVersion) === -1);
        }
      } catch (error) {
        console.warn("[VersionCheck] Error checking app version:", error);
      }
    };

    checkAppVersion();
  }, []);

  const handleRetry = async () => {
    try {
      const state = await NetInfo.fetch();
      setIsConnected(Boolean(state.isConnected));
      setShowNoInternet(!state.isConnected);

      if (state.isConnected) {
        webViewRef.current?.reload?.();
      } else if (Platform.OS === "android") {
        ToastAndroid.show("Still no internet connection", ToastAndroid.SHORT);
      } else {
        Alert.alert("No Internet", "Still no connection. Please try again later.");
      }
    } catch (error) {
      console.error("[Network] Retry failed:", error);
    }
  };

  const handleUpdateNavigation = () => {
    const url = apkUrl.trim();
    if (!url) {
      Alert.alert("Update", "Update link unavailable.");
      return;
    }

    Linking.openURL(url).catch(() => {
      if (Platform.OS === "android") {
        ToastAndroid.show("Unable to open update link", ToastAndroid.SHORT);
      } else {
        Alert.alert("Update", "Unable to open update link.");
      }
    });
  };

  const askUserForDownloadsAccess = async () => {
    if (Platform.OS !== "android") return null;

    return new Promise(resolve => {
      Alert.alert(
        "Downloads access",
        "Allow the app to save files to your Downloads folder?",
        [
          {
            text: "No",
            style: "cancel",
            onPress: () => {
              ToastAndroid.show("Saving inside app storage", ToastAndroid.SHORT);
              resolve(null);
            },
          },
          {
            text: "Yes",
            onPress: async () => {
              try {
                const res = await StorageAccessFramework.requestDirectoryPermissionsAsync();
                if (res?.granted && res.directoryUri) {
                  setDownloadsTreeUri(res.directoryUri);
                  ToastAndroid.show("Downloads access granted", ToastAndroid.SHORT);
                  resolve(res.directoryUri);
                  return;
                }

                ToastAndroid.show("Permission denied: saving in app storage", ToastAndroid.SHORT);
                resolve(null);
              } catch (error) {
                console.warn("[Download] Downloads permission failed:", error);
                ToastAndroid.show("Permission failed: saving in app storage", ToastAndroid.SHORT);
                resolve(null);
              }
            },
          },
        ],
        { cancelable: true }
      );
    });
  };

  const ensureDownloadsPermission = async () => {
    if (Platform.OS !== "android") return null;
    if (!StorageAccessFramework?.requestDirectoryPermissionsAsync) return null;
    return downloadsTreeUri || askUserForDownloadsAccess();
  };

  const downloadFile = async (url, suggestedName) => {
    if (!url || activeDownloads.current.has(url)) {
      if (url) Alert.alert("Download", "This file is already downloading.");
      return;
    }

    const fileName = sanitizeFileName(extractFileNameFromUrl(url, suggestedName));
    const tempUri = `${getDestinationDir()}${fileName}`;
    activeDownloads.current.add(url);

    try {
      if (Platform.OS === "ios") {
        Alert.alert(
          "Download",
          `What do you want to do with "${fileName}"?`,
          [
            {
              text: "Save to Files",
              onPress: () => downloadAndShareIos(url, tempUri, fileName, "Save to Files"),
            },
            {
              text: "Share",
              onPress: () => downloadAndShareIos(url, tempUri, fileName, "Share file"),
            },
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => activeDownloads.current.delete(url),
            },
          ],
          {
            cancelable: true,
            onDismiss: () => activeDownloads.current.delete(url),
          }
        );
        return;
      }

      ToastAndroid.show("Downloading...", ToastAndroid.SHORT);
      const result = await FileSystem.downloadAsync(url, tempUri);
      const treeUri = await ensureDownloadsPermission();

      if (treeUri) {
        const createdUri = await StorageAccessFramework.createFileAsync(treeUri, fileName, guessMime(fileName));
        const base64 = await FileSystem.readAsStringAsync(result.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.writeAsStringAsync(createdUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
      }

      ToastAndroid.show("Downloaded successfully", ToastAndroid.SHORT);
    } catch (error) {
      console.error("[Download] Failed:", error);
      if (Platform.OS === "android") {
        ToastAndroid.show("Download failed", ToastAndroid.LONG);
      } else {
        Alert.alert("Download failed", "Unable to download this file.");
      }
    } finally {
      if (Platform.OS !== "ios") {
        activeDownloads.current.delete(url);
      }
    }
  };

  const downloadAndShareIos = async (url, tempUri, fileName, dialogTitle) => {
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Download", "Sharing is not available on this device.");
        return;
      }

      const result = await FileSystem.downloadAsync(url, tempUri);
      await Sharing.shareAsync(result.uri, {
        mimeType: guessMime(fileName),
        dialogTitle,
        UTI: "public.data",
      });
      await FileSystem.deleteAsync(result.uri, { idempotent: true });
    } catch (error) {
      console.error("[Download] iOS share failed:", error);
      Alert.alert("Download failed", "Unable to download this file.");
    } finally {
      activeDownloads.current.delete(url);
    }
  };

  const injectedJavaScript = `
    (function() {
      try {
        var meta = document.querySelector('meta[name="viewport"]');
        if (!meta) {
          meta = document.createElement('meta');
          meta.setAttribute('name', 'viewport');
          document.head.appendChild(meta);
        }
        meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
      } catch (e) {}

      window._origOpen = window.open;
      window.open = function(url) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'open', url: url }));
        } catch(e) {}
        return null;
      };

      function looksLikeDownloadLink(a) {
        if (!a || !a.href) return false;
        return new RegExp(${JSON.stringify(DOWNLOAD_EXTENSIONS_FOR_WEB)}, 'i').test(a.href);
      }

      function postDownload(url) {
        if (!url) return;
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'download', url: url }));
        } catch(e) {}
      }

      document.addEventListener('click', function(e) {
        var a = e.target.closest && e.target.closest('a');
        if (looksLikeDownloadLink(a)) {
          e.preventDefault();
          postDownload(a.href);
        }
      }, true);

      document.addEventListener('contextmenu', function(e) {
        var a = e.target.closest && e.target.closest('a');
        if (looksLikeDownloadLink(a)) postDownload(a.href);
      }, true);
    })();
    true;
  `;

  const injectedBeforeContentLoaded = `
    (function () {
      try {
        var meta = document.querySelector('meta[name="viewport"]');
        if (!meta) {
          meta = document.createElement('meta');
          meta.name = 'viewport';
          document.head.appendChild(meta);
        }
        meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no';

        var lastTouchEnd = 0;
        document.addEventListener('touchend', function (event) {
          var now = new Date().getTime();
          if (now - lastTouchEnd <= 300) event.preventDefault();
          lastTouchEnd = now;
        }, false);

        ['gesturestart', 'gesturechange', 'gestureend'].forEach(function(eventName) {
          document.addEventListener(eventName, function(event) {
            event.preventDefault();
          }, false);
        });
      } catch (e) {}
    })();
    true;
  `;

  const handleWebMessage = async event => {
    try {
      const data = JSON.parse(event.nativeEvent.data || "{}");
      const url = data?.url || data?.href;
      if (!url) return;

      if (data.type === "download" || isLikelyDownloadUrl(url)) {
        await downloadFile(url);
        return;
      }

      if (data.type === "open") {
        if (isExternalAppUrl(url)) {
          await openExternalUrl(url);
          return;
        }

        webViewRef.current?.injectJavaScript(`
          window.location.href = ${JSON.stringify(url)};
          true;
        `);
      }
    } catch (error) {
      console.warn("[WebView] Message handling failed:", error);
    }
  };

  const openExternalUrl = async url => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.warn("[WebView] Failed to open external URL:", error);
      if (Platform.OS === "android") {
        ToastAndroid.show("No app found to open this link.", ToastAndroid.SHORT);
      } else {
        Alert.alert("Open link", "No app found to open this link.");
      }
    }
  };

  const handleShouldStartLoad = request => {
    try {
      const url = request?.url || "";

      if (Platform.OS === "android" && url.startsWith("upi://")) {
        Linking.openURL(url).catch(error => {
          console.warn("Failed to open UPI app:", error);
          ToastAndroid.show("No UPI app found to handle this payment.", ToastAndroid.SHORT);
        });
        return false;
      }

      if (isLikelyDownloadUrl(url)) {
        downloadFile(url);
        return false;
      }
    } catch (error) {
      console.warn("[WebView] Navigation check failed:", error);
    }

    return true;
  };

  const handleFileDownload = event => {
    const nativeUrl = event?.nativeEvent?.downloadUrl || event?.nativeEvent?.url;
    if (isLikelyDownloadUrl(nativeUrl)) {
      downloadFile(nativeUrl);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: dynamicBottomPadding }]}>
      {showSplash && (
        <View style={styles.splashFullScreen}>
          <Image source={require("./assets/splash.jpg")} style={styles.splashFullScreenImage} resizeMode="cover" />
        </View>
      )}

      {isConnected && (
        <WebView
          ref={webViewRef}
          source={{
            uri: SCHOOL_URL,
            headers: {
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
              Expires: "0",
            },
          }}
          style={[styles.webView, isGestureNavigation && { marginBottom: insets.bottom }, showSplash && styles.hiddenWebView]}
          mixedContentMode="always"
          originWhitelist={["*"]}
          textZoom={100}
          bounces={false}
          overScrollMode="never"
          scrollEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          injectedJavaScript={injectedJavaScript}
          injectedJavaScriptBeforeContentLoaded={injectedBeforeContentLoaded}
          onMessage={handleWebMessage}
          onError={event => console.log("ERROR", event.nativeEvent)}
          onHttpError={event => console.log("HTTP ERROR", event.nativeEvent)}
          onNavigationStateChange={navState => setCanGoBack(navState.canGoBack)}
          onLoadStart={() => {
            webViewStartRef.current = Date.now();
            console.log("[WebView] Load started at:", webViewStartRef.current);
          }}
          onLoadEnd={() => {
            const now = Date.now();
            const loadMs = webViewStartRef.current ? now - webViewStartRef.current : 0;
            console.log(`[WebView] Load finished in ${loadMs} ms (${(loadMs / 1000).toFixed(2)} s)`);
            setWebViewLoaded(true);
          }}
          setBuiltInZoomControls={false}
          setDisplayZoomControls={false}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          onFileDownload={handleFileDownload}
        />
      )}

      {!isConnected && (
        <Modal transparent visible={showNoInternet} animationType="fade">
          <View style={styles.modalContainer}>
            <View style={styles.popup}>
              <Text style={styles.popupTitle}>No Internet Connection</Text>
              <Text style={styles.popupText}>Please check your connection and try again.</Text>
              <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {forceUpdate && (
        <Modal visible transparent animationType="fade">
          <View style={styles.updateModalContainer}>
            <View style={styles.updatePopup}>
              <Text style={styles.updateTitle}>Update Required</Text>
              <Text style={styles.updateText}>A new version of the app is available. Please update to continue.</Text>
              <TouchableOpacity style={styles.updateButton} onPress={handleUpdateNavigation}>
                <Text style={styles.updateButtonText}>Update Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      <StatusBar style="auto" />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  splashFullScreen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  splashFullScreenImage: {
    width: "100%",
    height: "100%",
  },
  webView: {
    flex: 1,
  },
  hiddenWebView: {
    opacity: 0,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  popup: {
    width: "80%",
    padding: 20,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  popupTitle: {
    marginBottom: 10,
    fontSize: 20,
    fontWeight: "bold",
  },
  popupText: {
    marginBottom: 20,
    textAlign: "center",
    fontSize: 16,
  },
  retryButton: {
    paddingHorizontal: 30,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#007bff",
  },
  retryButtonText: {
    color: "#ffffff",
    fontWeight: "bold",
  },
  updateModalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  updatePopup: {
    width: "84%",
    padding: 24,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#ffffff",
  },
  updateTitle: {
    marginBottom: 12,
    fontSize: 20,
    fontWeight: "bold",
  },
  updateText: {
    marginBottom: 22,
    textAlign: "center",
    fontSize: 16,
  },
  updateButton: {
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#dc3545",
  },
  updateButtonText: {
    color: "#ffffff",
    fontWeight: "bold",
  },
});
