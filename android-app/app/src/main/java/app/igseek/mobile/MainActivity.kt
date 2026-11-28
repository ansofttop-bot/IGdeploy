package app.igseek.mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.speech.RecognizerIntent
import android.util.Base64
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.fragment.app.FragmentActivity
import app.igseek.mobile.data.models.ChatAttachment
import app.igseek.mobile.data.models.SharedIncomingPayload
import app.igseek.mobile.ui.IGseekAppRoot
import app.igseek.mobile.ui.components.IGseekCanvas
import app.igseek.mobile.ui.components.IGseekFoxLogo
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.IGseekTheme
import app.igseek.mobile.notifications.IGseekNotificationManager
import app.igseek.mobile.widget.IGseekQuickWidget
import org.json.JSONObject

class MainActivity : FragmentActivity() {

    private val viewModel: IGseekViewModel by viewModels()
    private var isUnlocked by mutableStateOf(true)
    private var awaitingCustomTabAuth: Boolean = false

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val isEn = viewModel.state.value.layoutPrefs.language == "en"
        if (granted) {
            IGseekNotificationManager.ensureChannels(this)
            viewModel.showToast(if (isEn) "Push notifications enabled" else "Push-уведомления включены")
        }
    }

    private val widgetVoiceLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { res ->
        if (res.resultCode == Activity.RESULT_OK) {
            val spoken = res.data
                ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()
            if (!spoken.isNullOrBlank()) {
                viewModel.appendVoiceTranscript(spoken)
            }
        }
    }

    private fun launchWidgetVoiceInput() {
        val isEn = viewModel.state.value.layoutPrefs.language == "en"
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, if (isEn) "en-US" else "ru-RU")
            putExtra(RecognizerIntent.EXTRA_PROMPT, if (isEn) "Ask IGseek…" else "Скажите запрос для IGseek…")
        }
        runCatching { widgetVoiceLauncher.launch(intent) }
    }

    private fun requestNotificationPermissionIfNeeded() {
        IGseekNotificationManager.ensureChannels(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (awaitingCustomTabAuth) {
            awaitingCustomTabAuth = false
            // If user closed Chrome Custom Tab without selecting an account, stop loading spinner cleanly
            if (viewModel.state.value.session == null && viewModel.state.value.isGoogleAuthLoading) {
                viewModel.setGoogleAuthLoading(false)
            }
        } else {
            viewModel.syncAllFromCloudIfStale()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleIncomingIntent(intent)

        IGseekNotificationManager.ensureChannels(this)
        if (viewModel.state.value.layoutPrefs.notificationsEnabled) {
            requestNotificationPermissionIfNeeded()
        }

        if (viewModel.state.value.layoutPrefs.biometricLockEnabled && canUseBiometrics()) {
            isUnlocked = false
            promptBiometricUnlock()
        }

        setContent {
            val state by viewModel.state.collectAsState()
            val view = LocalView.current
            val isDark = state.layoutPrefs.darkTheme

            // Ensure crisp dark status/nav bar icons on Light theme and white icons on Dark theme
            SideEffect {
                val controller = WindowCompat.getInsetsController(window, view)
                controller.isAppearanceLightStatusBars = !isDark
                controller.isAppearanceLightNavigationBars = !isDark
            }

            IGseekTheme(darkTheme = isDark, accent = state.layoutPrefs.accent) {
                if (!isUnlocked) {
                    IGseekCanvas {
                        Box(
                            modifier = Modifier.fillMaxSize().padding(24.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Center
                            ) {
                                IGseekFoxLogo(size = 64.dp, showGlow = true)
                                Spacer(Modifier.height(16.dp))
                                Text(
                                    "IGseek защищён биометрией",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = MaterialTheme.colorScheme.onBackground
                                )
                                Spacer(Modifier.height(14.dp))
                                Button(
                                    onClick = { promptBiometricUnlock() },
                                    shape = RoundedCornerShape(50)
                                ) {
                                    Text("Разблокировать")
                                }
                            }
                        }
                    }
                } else {
                    IGseekAppRoot(
                        state = state,
                        viewModel = viewModel,
                        onLaunchGoogleSignIn = { launchGoogleSignIn() },
                        onRequestNotificationPermission = { requestNotificationPermissionIfNeeded() }
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingIntent(intent)
    }

    private fun launchGoogleSignIn() {
        // Opens Firebase Auth handler directly in an in-app Chrome Custom Tab, which immediately
        // redirects straight to Google's account picker (no IGseek website page in between) and
        // returns directly to MainActivity via BuildConfig.FIREBASE_AUTH_SCHEME://firebaseauth/link.
        val authUrl = viewModel.buildDirectGoogleAuthUrl() ?: return
        awaitingCustomTabAuth = true
        runCatching {
            val customTabs = CustomTabsIntent.Builder()
                .setShowTitle(true)
                .setShareState(CustomTabsIntent.SHARE_STATE_OFF)
                .build()
            customTabs.launchUrl(this, authUrl)
        }.onFailure {
            runCatching {
                startActivity(Intent(Intent.ACTION_VIEW, authUrl))
            }.onFailure {
                awaitingCustomTabAuth = false
                viewModel.onGoogleAuthError("Не удалось открыть окно выбора аккаунта Google")
            }
        }
    }

    private fun handleIncomingIntent(intent: Intent?) {
        if (intent == null) return

        val dataUri = intent.data
        // 1. Direct Firebase Auth handler callback:
        //    app-1-862718593529-web-...://firebaseauth/link?deep_link_id=<encoded callback URL>
        if (dataUri != null &&
            dataUri.scheme.equals(BuildConfig.FIREBASE_AUTH_SCHEME, ignoreCase = true) &&
            dataUri.host.equals("firebaseauth", ignoreCase = true)
        ) {
            awaitingCustomTabAuth = false
            intent.data = null
            setIntent(intent)

            val deepLinkId = dataUri.getQueryParameter("deep_link_id")
            if (deepLinkId.isNullOrBlank()) {
                viewModel.onGoogleAuthError("Не получен ответ от Google. Попробуйте ещё раз.")
                return
            }
            val callbackUri = runCatching { Uri.parse(deepLinkId) }.getOrNull()
            val firebaseError = callbackUri?.getQueryParameter("firebaseError")
            if (!firebaseError.isNullOrBlank()) {
                val msg = runCatching {
                    JSONObject(firebaseError).optString("message")
                }.getOrNull().orEmpty()
                viewModel.onGoogleAuthError(
                    if (msg.contains("cancel", ignoreCase = true)) "Вход через Google отменён"
                    else msg.ifBlank { "Не удалось войти через Google" }
                )
                return
            }
            val innerLink = callbackUri?.getQueryParameter("link").orEmpty()
            val eventId = callbackUri?.getQueryParameter("eventId")
            if (innerLink.isBlank()) {
                viewModel.onGoogleAuthError("Не получена ссылка подтверждения от Google. Попробуйте ещё раз.")
                return
            }
            viewModel.completeFirebaseOAuthCallback(innerLink, eventId)
            return
        }

        // 2. Legacy custom scheme callback (backward compatibility):
        //    app.igseek.mobile://auth#firebase_id_token=...
        if (dataUri != null && dataUri.scheme == "app.igseek.mobile" && dataUri.host == "auth") {
            awaitingCustomTabAuth = false
            intent.data = null
            setIntent(intent)
            val fragment = dataUri.fragment.orEmpty()
            val query = dataUri.encodedQuery.orEmpty()
            val combined = if (fragment.isNotBlank()) fragment else query
            val params = combined.split("&").mapNotNull { pair ->
                val parts = pair.split("=", limit = 2)
                if (parts.size == 2) parts[0] to Uri.decode(parts[1]) else null
            }.toMap()
            val firebaseIdToken = params["firebase_id_token"]
            val refreshToken = params["refresh_token"].orEmpty()
            val uid = params["uid"].orEmpty()
            val email = params["email"].orEmpty()
            val displayName = params["name"].orEmpty()
            val state = params["state"]
            val idToken = params["id_token"]
            val accessToken = params["access_token"]
            val error = params["error"]

            when {
                !firebaseIdToken.isNullOrBlank() -> {
                    if (!viewModel.verifyAndConsumeOAuthState(state)) {
                        viewModel.onGoogleAuthError("Ошибка проверки состояния авторизации. Попробуйте ещё раз.")
                    } else {
                        viewModel.signInWithFirebaseBridge(
                            uid = uid,
                            email = email,
                            displayName = displayName,
                            idToken = firebaseIdToken,
                            refreshToken = refreshToken
                        )
                    }
                }
                !idToken.isNullOrBlank() -> viewModel.signInWithGoogleIdToken(idToken)
                !accessToken.isNullOrBlank() -> viewModel.signInWithGoogleAccessToken(accessToken)
                !error.isNullOrBlank() -> viewModel.onGoogleAuthError("Вход через Google отменён ($error)")
            }
            return
        }

        val widgetAction = intent.getStringExtra(IGseekQuickWidget.EXTRA_WIDGET_ACTION)
        val widgetChatId = intent.getStringExtra(IGseekQuickWidget.EXTRA_WIDGET_CHAT_ID)
        val tabKey = intent.getStringExtra(IGseekQuickWidget.EXTRA_START_TAB)
        if (!widgetAction.isNullOrBlank()) {
            intent.removeExtra(IGseekQuickWidget.EXTRA_WIDGET_ACTION)
            intent.removeExtra(IGseekQuickWidget.EXTRA_WIDGET_CHAT_ID)
            when (widgetAction) {
                IGseekQuickWidget.ACTION_NEW_CHAT -> viewModel.openFreshChatFromWidget()
                IGseekQuickWidget.ACTION_IMAGE_MODE -> viewModel.openImageModeFromWidget()
                IGseekQuickWidget.ACTION_VOICE -> {
                    viewModel.openFreshChatFromWidget()
                    launchWidgetVoiceInput()
                }
                IGseekQuickWidget.ACTION_OPEN_CHAT -> {
                    if (!widgetChatId.isNullOrBlank()) viewModel.openChatFromWidget(widgetChatId)
                    else viewModel.selectTabByKey("chat")
                }
                else -> if (!tabKey.isNullOrBlank()) viewModel.selectTabByKey(tabKey)
            }
        } else if (!tabKey.isNullOrBlank()) {
            viewModel.selectTabByKey(tabKey)
        }

        if (intent.action == Intent.ACTION_SEND) {
            val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
            val streamUri: Uri? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
            } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(Intent.EXTRA_STREAM)
            }
            val attachment = streamUri?.let { readUriToAttachment(it, intent.type) }
            if (!sharedText.isNullOrBlank() || attachment != null) {
                viewModel.onIncomingShare(SharedIncomingPayload(text = sharedText, attachment = attachment))
            }
        }
    }

    private fun readUriToAttachment(uri: Uri, fallbackMime: String?): ChatAttachment? {
        return runCatching {
            val mime = contentResolver.getType(uri) ?: fallbackMime ?: "application/octet-stream"
            var name = "shared_${System.currentTimeMillis()}"
            contentResolver.query(uri, null, null, null, null)?.use { c ->
                val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0 && c.moveToFirst()) name = c.getString(idx) ?: name
            }
            val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
            if (bytes.size > 6 * 1024 * 1024) return null
            val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            ChatAttachment(name, mime, "data:$mime;base64,$b64", bytes.size.toLong())
        }.getOrNull()
    }

    private fun canUseBiometrics(): Boolean {
        val status = BiometricManager.from(this).canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        )
        return status == BiometricManager.BIOMETRIC_SUCCESS
    }

    private fun promptBiometricUnlock() {
        val prompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    isUnlocked = true
                }
            }
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Вход в IGseek")
            .setSubtitle("Подтвердите личность для доступа к чатам и Library")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL)
            .build()
        prompt.authenticate(info)
    }
}
