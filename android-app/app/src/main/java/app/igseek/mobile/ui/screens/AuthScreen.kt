package app.igseek.mobile.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Email
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import app.igseek.mobile.ui.state.IGseekUiState

@Composable
fun AuthScreen(
    state: IGseekUiState,
    onSignIn: (String, String) -> Unit,
    onSignUp: (String, String, String) -> Unit,
    onPasswordReset: (String) -> Unit,
    onContinueAsGuest: () -> Unit,
    onUpdateServerUrl: (String) -> Unit
) {
    var isRegisterMode by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var showServerField by remember { mutableStateOf(false) }
    var serverDraft by remember(state.serverBaseUrl) { mutableStateOf(state.serverBaseUrl) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Rounded.Star,
                contentDescription = "IGseek",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(34.dp)
            )
        }

        Spacer(Modifier.height(16.dp))

        Text(
            text = "IGseek",
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onBackground
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = if (isRegisterMode) "Создайте аккаунт для облачной синхронизации" else "Единый AI-клиент: Чат, Flow, Library и Память",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(Modifier.height(24.dp))

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 1.dp
        ) {
            Column(
                modifier = Modifier.padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val activeColor = MaterialTheme.colorScheme.primary
                    val inactiveColor = MaterialTheme.colorScheme.surfaceVariant
                    Surface(
                        onClick = { isRegisterMode = false },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                        color = if (!isRegisterMode) activeColor else inactiveColor
                    ) {
                        Box(modifier = Modifier.padding(vertical = 10.dp), contentAlignment = Alignment.Center) {
                            Text(
                                text = "Вход",
                                style = MaterialTheme.typography.labelMedium,
                                color = if (!isRegisterMode) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    Surface(
                        onClick = { isRegisterMode = true },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                        color = if (isRegisterMode) activeColor else inactiveColor
                    ) {
                        Box(modifier = Modifier.padding(vertical = 10.dp), contentAlignment = Alignment.Center) {
                            Text(
                                text = "Регистрация",
                                style = MaterialTheme.typography.labelMedium,
                                color = if (isRegisterMode) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                AnimatedVisibility(visible = isRegisterMode) {
                    OutlinedTextField(
                        value = displayName,
                        onValueChange = { displayName = it },
                        label = { Text("Имя") },
                        leadingIcon = { Icon(Icons.Rounded.Person, contentDescription = null) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp)
                    )
                }

                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email") },
                    leadingIcon = { Icon(Icons.Rounded.Email, contentDescription = null) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp)
                )

                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Пароль") },
                    leadingIcon = { Icon(Icons.Rounded.Lock, contentDescription = null) },
                    trailingIcon = {
                        TextButton(onClick = { showPassword = !showPassword }) {
                            Text(if (showPassword) "Скрыть" else "Показ", style = MaterialTheme.typography.labelMedium)
                        }
                    },
                    visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp)
                )

                if (!state.authError.isNullOrBlank()) {
                    Text(
                        text = state.authError,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.labelMedium
                    )
                }

                Button(
                    onClick = {
                        if (isRegisterMode) onSignUp(email.trim(), password, displayName.trim())
                        else onSignIn(email.trim(), password)
                    },
                    enabled = !state.authLoading && email.isNotBlank() && password.length >= 6,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(14.dp)
                ) {
                    if (state.authLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                    } else {
                        Text(if (isRegisterMode) "Создать аккаунт" else "Войти")
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (!isRegisterMode) {
                        TextButton(
                            onClick = { if (email.isNotBlank()) onPasswordReset(email.trim()) },
                            enabled = email.isNotBlank()
                        ) {
                            Text("Забыли пароль?", style = MaterialTheme.typography.labelMedium)
                        }
                    } else {
                        Spacer(Modifier.size(1.dp))
                    }
                    TextButton(onClick = { showServerField = !showServerField }) {
                        Icon(Icons.Rounded.Settings, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.size(4.dp))
                        Text("Сервер API", style = MaterialTheme.typography.labelMedium)
                    }
                }

                AnimatedVisibility(visible = showServerField) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = serverDraft,
                            onValueChange = { serverDraft = it },
                            label = { Text("URL backend IGseek") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        )
                        OutlinedButton(
                            onClick = { onUpdateServerUrl(serverDraft) },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Text("Сохранить URL сервера")
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(14.dp))

        OutlinedButton(
            onClick = onContinueAsGuest,
            modifier = Modifier.fillMaxWidth().height(46.dp),
            shape = RoundedCornerShape(14.dp)
        ) {
            Text("Продолжить без входа (локальный режим)")
        }
    }
}
