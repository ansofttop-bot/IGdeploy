package app.igseek.mobile

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.util.Base64
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
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
import androidx.compose.runtime.LaunchedEffect
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
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import app.igseek.mobile.data.models.ChatAttachment
import app.igseek.mobile.data.models.SharedIncomingPayload
import app.igseek.mobile.ui.IGseekAppRoot
import app.igseek.mobile.ui.components.IGseekCanvas
import app.igseek.mobile.ui.components.IGseekFoxLogo
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.IGseekTheme
import app.igseek.mobile.widget.IGseekQuickWidget
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

class MainActivity : FragmentActivity() {

    private val viewModel: IGseekViewModel by viewModels()
    private var isUnlocked by mutableStateOf(true)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleIncomingIntent(intent)

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

            LaunchedEffect(state.checkoutUrlEvent) {
                val url = state.checkoutUrlEvent
                if (!url.isNullOrBlank()) {
                    openCustomTab(url)
                    viewModel.consumeCheckoutUrl()
                }
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
                        onLaunchGoogleSignIn = { launchGoogleSignIn() }
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
        val clientId = BuildConfig.FIREBASE_OAUTH_CLIENT_ID.trim()
        if (clientId.isBlank()) {
            viewModel.onGoogleAuthError("Google OAuth Client ID не настроен в сборке")
            return
        }

        lifecycleScope.launch {
            viewModel.setGoogleAuthLoading(true)
            val credentialManager = CredentialManager.create(this@MainActivity)
            val googleIdOption = GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(clientId)
                .setAutoSelectEnabled(false)
                .build()
            val request = GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOption)
                .build()

            try {
                val result = credentialManager.getCredential(
                    request = request,
                    context = this@MainActivity
                )
                val credential = result.credential
                if (credential is CustomCredential &&
                    credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                ) {
                    val googleCred = GoogleIdTokenCredential.createFrom(credential.data)
                    viewModel.signInWithGoogleIdToken(googleCred.idToken)
                } else {
                    viewModel.onGoogleAuthError("Не удалось получить токен Google")
                }
            } catch (_: GetCredentialCancellationException) {
                viewModel.setGoogleAuthLoading(false)
            } catch (_: Exception) {
                // Fallback to browser OAuth Custom Tab if Credential Manager is unavailable or debug SHA-1 differs
                viewModel.setGoogleAuthLoading(false)
                launchGoogleBrowserOAuthFallback(clientId)
            }
        }
    }

    private fun launchGoogleBrowserOAuthFallback(clientId: String) {
        val redirectUri = URLEncoder.encode("app.igseek.mobile://auth", StandardCharsets.UTF_8.name())
        val scope = URLEncoder.encode("openid email profile", StandardCharsets.UTF_8.name())
        val nonce = System.currentTimeMillis().toString()
        val url = "https://accounts.google.com/o/oauth2/v2/auth" +
            "?client_id=$clientId" +
            "&redirect_uri=$redirectUri" +
            "&response_type=token" +
            "&scope=$scope" +
            "&prompt=select_account" +
            "&nonce=$nonce"
        openCustomTab(url)
    }

    private fun handleIncomingIntent(intent: Intent?) {
        if (intent == null) return

        // Handle Google OAuth Custom Tab redirect: app.igseek.mobile://auth#access_token=... or ?id_token=...
        val dataUri = intent.data
        if (dataUri != null && dataUri.scheme == "app.igseek.mobile" && dataUri.host == "auth") {
            val fragment = dataUri.fragment.orEmpty()
            val query = dataUri.encodedQuery.orEmpty()
            val combined = if (fragment.isNotBlank()) fragment else query
            val params = combined.split("&").mapNotNull { pair ->
                val parts = pair.split("=", limit = 2)
                if (parts.size == 2) parts[0] to Uri.decode(parts[1]) else null
            }.toMap()
            val idToken = params["id_token"]
            val accessToken = params["access_token"]
            val error = params["error"]
            when {
                !idToken.isNullOrBlank() -> viewModel.signInWithGoogleIdToken(idToken)
                !accessToken.isNullOrBlank() -> viewModel.signInWithGoogleAccessToken(accessToken)
                !error.isNullOrBlank() -> viewModel.onGoogleAuthError("Вход через Google отменён ($error)")
            }
            return
        }

        val tabKey = intent.getStringExtra(IGseekQuickWidget.EXTRA_START_TAB)
        if (!tabKey.isNullOrBlank()) viewModel.selectTabByKey(tabKey)

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

    private fun openCustomTab(url: String) {
        runCatching {
            CustomTabsIntent.Builder().build().launchUrl(this, Uri.parse(url))
        }.onFailure {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        }
    }
}
