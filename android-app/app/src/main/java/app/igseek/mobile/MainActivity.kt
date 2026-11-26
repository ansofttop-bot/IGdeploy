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
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import app.igseek.mobile.data.models.ChatAttachment
import app.igseek.mobile.data.models.SharedIncomingPayload
import app.igseek.mobile.ui.IGseekAppRoot
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.IGseekTheme
import app.igseek.mobile.widget.IGseekQuickWidget

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

            LaunchedEffect(state.checkoutUrlEvent) {
                val url = state.checkoutUrlEvent
                if (!url.isNullOrBlank()) {
                    openCustomTab(url)
                    viewModel.consumeCheckoutUrl()
                }
            }

            IGseekTheme(darkTheme = state.layoutPrefs.darkTheme, accent = state.layoutPrefs.accent) {
                if (!isUnlocked) {
                    Box(
                        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(24.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                            Icon(Icons.Rounded.Lock, contentDescription = "Разблокировка", tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(64.dp))
                            Spacer(Modifier.height(16.dp))
                            Text("IGseek защищён биометрией", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground)
                            Spacer(Modifier.height(14.dp))
                            Button(onClick = { promptBiometricUnlock() }, shape = RoundedCornerShape(14.dp)) { Text("Разблокировать") }
                        }
                    }
                } else {
                    IGseekAppRoot(state = state, viewModel = viewModel)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingIntent(intent)
    }

    private fun handleIncomingIntent(intent: Intent?) {
        if (intent == null) return
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
