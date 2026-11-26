package app.igseek.mobile.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Email
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.igseek.mobile.data.models.AccentPresetId
import app.igseek.mobile.ui.components.IGseekCanvas
import app.igseek.mobile.ui.components.IGseekFoxLogo
import app.igseek.mobile.ui.components.IGseekGlassCard
import app.igseek.mobile.ui.components.IGseekGlassChip
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.LocalIGseekPalette
import app.igseek.mobile.ui.theme.accentSwatchColor

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AuthScreen(
    state: IGseekUiState,
    viewModel: IGseekViewModel
) {
    val palette = LocalIGseekPalette.current
    val isEn = state.layoutPrefs.language == "en"

    if (state.needsAccentOnboarding) {
        AccentOnboardingStep(
            state = state,
            viewModel = viewModel
        )
        return
    }

    var isSignUp by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    val authErr = state.authError

    IGseekCanvas {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Top Controls (Theme + Language — mirrors AuthCard.tsx)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IGseekGlassChip(
                    label = if (state.layoutPrefs.darkTheme) "Тёмная" else "Светлая",
                    selected = false,
                    onClick = { viewModel.updateLayoutPrefs { it.copy(darkTheme = !it.darkTheme) } }
                )
                Spacer(Modifier.width(8.dp))
                IGseekGlassChip(
                    label = if (isEn) "EN" else "RU",
                    selected = false,
                    onClick = {
                        viewModel.updateLayoutPrefs {
                            it.copy(language = if (it.language == "en") "ru" else "en")
                        }
                    }
                )
            }

            Spacer(Modifier.height(28.dp))

            // Authentic IGseek Fox Brand Hero
            IGseekFoxLogo(size = 62.dp, showGlow = true)
            Spacer(Modifier.height(10.dp))
            Text(
                text = "IGseek",
                style = MaterialTheme.typography.headlineMedium,
                color = palette.textPrimary
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = if (isEn) {
                    "AI workspace · Direct cloud sync · Built for speed"
                } else {
                    "ИИ-пространство · Прямая синхронизация · Работает напрямую"
                },
                style = MaterialTheme.typography.bodySmall,
                color = palette.textMuted,
                textAlign = TextAlign.Center
            )

            Spacer(Modifier.height(24.dp))

            IGseekGlassCard(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(22.dp),
                contentPadding = 18.dp
            ) {
                // Segmented Sign In / Sign Up Switcher
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    color = palette.chipBg,
                    border = BorderStroke(1.dp, palette.glassBorder)
                ) {
                    Row(
                        modifier = Modifier.padding(4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        AuthModeTab(
                            title = if (isEn) "Sign In" else "Вход",
                            selected = !isSignUp,
                            onClick = { isSignUp = false },
                            modifier = Modifier.weight(1f)
                        )
                        AuthModeTab(
                            title = if (isEn) "Sign Up" else "Регистрация",
                            selected = isSignUp,
                            onClick = { isSignUp = true },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }

                Spacer(Modifier.height(16.dp))

                val fieldColors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = palette.brand,
                    unfocusedBorderColor = palette.glassBorder,
                    focusedTextColor = palette.textPrimary,
                    unfocusedTextColor = palette.textPrimary,
                    focusedLabelColor = palette.brand,
                    unfocusedLabelColor = palette.textMuted,
                    cursorColor = palette.brand
                )

                if (isSignUp) {
                    OutlinedTextField(
                        value = displayName,
                        onValueChange = { displayName = it },
                        label = { Text(if (isEn) "Name" else "Имя") },
                        leadingIcon = { Icon(Icons.Rounded.Person, contentDescription = null, tint = palette.textMuted) },
                        singleLine = true,
                        shape = RoundedCornerShape(14.dp),
                        colors = fieldColors,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(10.dp))
                }

                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email") },
                    leadingIcon = { Icon(Icons.Rounded.Email, contentDescription = null, tint = palette.textMuted) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    colors = fieldColors,
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(Modifier.height(10.dp))

                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text(if (isEn) "Password" else "Пароль") },
                    leadingIcon = { Icon(Icons.Rounded.Lock, contentDescription = null, tint = palette.textMuted) },
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    colors = fieldColors,
                    modifier = Modifier.fillMaxWidth()
                )

                if (!authErr.isNullOrBlank()) {
                    Spacer(Modifier.height(10.dp))
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.error.copy(alpha = 0.14f),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.35f))
                    ) {
                        Text(
                            text = authErr,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(10.dp)
                        )
                    }
                }

                Spacer(Modifier.height(16.dp))

                Button(
                    onClick = {
                        if (isSignUp) {
                            viewModel.signUp(email, password, displayName)
                        } else {
                            viewModel.signIn(email, password)
                        }
                    },
                    enabled = !state.isAuthLoading && email.isNotBlank() && password.length >= 6,
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = palette.brand,
                        contentColor = palette.brandOn
                    ),
                    modifier = Modifier.fillMaxWidth().height(50.dp)
                ) {
                    if (state.isAuthLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color = palette.brandOn
                        )
                    } else {
                        Text(
                            text = if (isSignUp) {
                                if (isEn) "Create IGseek Account" else "Создать аккаунт IGseek"
                            } else {
                                if (isEn) "Continue" else "Войти в IGseek"
                            },
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }

                if (!isSignUp) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                        horizontalArrangement = Arrangement.End
                    ) {
                        TextButton(
                            onClick = {
                                if (email.isNotBlank()) viewModel.sendPasswordReset(email)
                                else viewModel.showToast(if (isEn) "Enter your email first" else "Сначала введите email")
                            }
                        ) {
                            Text(
                                text = if (isEn) "Forgot password?" else "Забыли пароль?",
                                style = MaterialTheme.typography.labelMedium,
                                color = palette.textMuted
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(14.dp))

            OutlinedButton(
                onClick = { viewModel.continueAsGuest() },
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, palette.glassBorder),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = palette.textSecondary),
                modifier = Modifier.fillMaxWidth().height(48.dp)
            ) {
                Text(
                    text = if (isEn) "Continue without account (Local)" else "Продолжить без аккаунта"
                )
            }

            Spacer(Modifier.height(14.dp))
            Text(
                text = if (isEn) {
                    "Your chats, projects, memories & library sync directly with your IGseek account."
                } else {
                    "Чаты, проекты, память и Library синхронизируются напрямую с вашим аккаунтом IGseek."
                },
                style = MaterialTheme.typography.bodySmall,
                color = palette.textMuted,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
        }
    }
}

@Composable
private fun AuthModeTab(
    title: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalIGseekPalette.current
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) palette.surfaceElevated else Color.Transparent)
            .border(
                width = 1.dp,
                color = if (selected) palette.glassBorder else Color.Transparent,
                shape = RoundedCornerShape(10.dp)
            )
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
            color = if (selected) palette.textPrimary else palette.textMuted
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AccentOnboardingStep(
    state: IGseekUiState,
    viewModel: IGseekViewModel
) {
    val palette = LocalIGseekPalette.current
    val isEn = state.layoutPrefs.language == "en"
    var chosen by remember(state.layoutPrefs.accent) { mutableStateOf(state.layoutPrefs.accent) }

    IGseekCanvas {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            IGseekFoxLogo(
                size = 72.dp,
                showGlow = true,
                tintOverride = accentSwatchColor(chosen, state.layoutPrefs.darkTheme)
            )
            Spacer(Modifier.height(14.dp))
            Text(
                text = if (isEn) "Choose your IGseek accent" else "Выберите ваш акцент IGseek",
                style = MaterialTheme.typography.headlineMedium,
                color = palette.textPrimary,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = if (isEn) {
                    "You can change the accent and theme anytime in Settings."
                } else {
                    "Цвет акцента и тему всегда можно изменить в настройках."
                },
                style = MaterialTheme.typography.bodySmall,
                color = palette.textMuted,
                textAlign = TextAlign.Center
            )

            Spacer(Modifier.height(22.dp))

            IGseekGlassCard(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(22.dp),
                contentPadding = 18.dp
            ) {
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    AccentPresetId.entries.forEach { preset ->
                        val swatch = accentSwatchColor(preset, state.layoutPrefs.darkTheme)
                        val active = chosen == preset
                        Surface(
                            modifier = Modifier
                                .clip(RoundedCornerShape(14.dp))
                                .clickable {
                                    chosen = preset
                                    viewModel.updateLayoutPrefs { it.copy(accent = preset) }
                                },
                            shape = RoundedCornerShape(14.dp),
                            color = if (active) swatch.copy(alpha = 0.18f) else palette.chipBg,
                            border = BorderStroke(
                                width = if (active) 1.5.dp else 1.dp,
                                color = if (active) swatch else palette.glassBorder
                            )
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(16.dp)
                                        .clip(CircleShape)
                                        .background(swatch),
                                    contentAlignment = Alignment.Center
                                ) {
                                    if (active) {
                                        Icon(
                                            Icons.Rounded.Check,
                                            contentDescription = null,
                                            tint = if (preset == AccentPresetId.BLACK && state.layoutPrefs.darkTheme) Color.Black else Color.White,
                                            modifier = Modifier.size(11.dp)
                                        )
                                    }
                                }
                                Text(
                                    text = preset.title,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = palette.textPrimary
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(20.dp))

                Button(
                    onClick = { viewModel.completeAccentOnboarding(chosen) },
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = accentSwatchColor(chosen, state.layoutPrefs.darkTheme),
                        contentColor = if (chosen == AccentPresetId.BLACK && state.layoutPrefs.darkTheme) Color.Black else Color.White
                    ),
                    modifier = Modifier.fillMaxWidth().height(50.dp)
                ) {
                    Text(
                        text = if (isEn) "Start using IGseek" else "Начать работу в IGseek",
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}
