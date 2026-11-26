package app.igseek.mobile.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.imePadding
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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.igseek.mobile.data.models.AccentPresetId
import app.igseek.mobile.ui.components.GoogleGIcon
import app.igseek.mobile.ui.components.IGseekCanvas
import app.igseek.mobile.ui.components.IGseekFoxLogo
import app.igseek.mobile.ui.components.IGseekGlassCard
import app.igseek.mobile.ui.components.IGseekGlassChip
import app.igseek.mobile.ui.components.IGseekWordmark
import app.igseek.mobile.ui.components.LucideIcons
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.LocalIGseekPalette
import app.igseek.mobile.ui.theme.accentSwatchColor

@Composable
fun AuthScreen(
    state: IGseekUiState,
    viewModel: IGseekViewModel,
    onLaunchGoogleSignIn: () -> Unit
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

    var mode by remember { mutableStateOf("signin") } // "signin" | "signup"
    var showEmailForm by remember { mutableStateOf(false) }
    var isForgot by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }

    val authErr = state.authError
    val busy = state.isAuthLoading || state.isGoogleAuthLoading

    IGseekCanvas {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp, vertical = 14.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
            // Top Controls: Theme + Language (Lucide icons, website style)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IGseekGlassChip(
                    label = if (state.layoutPrefs.darkTheme) {
                        if (isEn) "Dark" else "Тёмная"
                    } else {
                        if (isEn) "Light" else "Светлая"
                    },
                    selected = false,
                    onClick = { viewModel.updateLayoutPrefs { it.copy(darkTheme = !it.darkTheme) } },
                    leading = {
                        Icon(
                            imageVector = if (state.layoutPrefs.darkTheme) LucideIcons.Moon else LucideIcons.Sun,
                            contentDescription = null,
                            tint = palette.textSecondary,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                )
                Spacer(Modifier.width(8.dp))
                IGseekGlassChip(
                    label = if (isEn) "EN" else "RU",
                    selected = false,
                    onClick = {
                        viewModel.updateLayoutPrefs {
                            it.copy(language = if (it.language == "en") "ru" else "en")
                        }
                    },
                    leading = {
                        Icon(
                            imageVector = LucideIcons.Languages,
                            contentDescription = null,
                            tint = palette.textSecondary,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                )
            }

            Spacer(Modifier.height(42.dp))

            // Authentic IGseek Fox + Wordmark Hero
            IGseekFoxLogo(size = 56.dp, showGlow = true)
            Spacer(Modifier.height(10.dp))
            IGseekWordmark(fontSize = 36.sp)
            Spacer(Modifier.height(4.dp))
            Text(
                text = if (isEn) "Find. Analyze. Create." else "Находи. Анализируй. Создавай.",
                style = MaterialTheme.typography.bodySmall,
                color = palette.textMuted,
                textAlign = TextAlign.Center
            )

            Spacer(Modifier.height(26.dp))

            // Website-style Pill Mode Switcher (Log in / Register)
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(50),
                color = palette.chipBg,
                border = BorderStroke(1.dp, palette.glassBorder)
            ) {
                Row(
                    modifier = Modifier.padding(4.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    AuthPillTab(
                        title = if (isEn) "Log in" else "Вход",
                        selected = mode == "signin",
                        onClick = {
                            mode = "signin"
                            showEmailForm = false
                            isForgot = false
                            viewModel.clearAuthError()
                        },
                        modifier = Modifier.weight(1f)
                    )
                    AuthPillTab(
                        title = if (isEn) "Register" else "Регистрация",
                        selected = mode == "signup",
                        onClick = {
                            mode = "signup"
                            showEmailForm = true
                            isForgot = false
                            viewModel.clearAuthError()
                        },
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            Spacer(Modifier.height(20.dp))

            // Error Alert Banner
            if (!authErr.isNullOrBlank()) {
                Surface(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 14.dp),
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.error.copy(alpha = 0.11f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.30f))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 13.dp, vertical = 11.dp),
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(9.dp)
                    ) {
                        Icon(
                            imageVector = LucideIcons.AlertCircle,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(16.dp).padding(top = 1.dp)
                        )
                        Text(
                            text = authErr,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
            }

            // Primary Auth Flow (mirrors AuthCard.tsx clean pill hierarchy)
            if (mode == "signin" && !showEmailForm && !isForgot) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(11.dp)
                ) {
                    GoogleSignInPillButton(
                        label = if (isEn) "Sign in with Google" else "Войти через Google",
                        loading = state.isGoogleAuthLoading,
                        enabled = !busy,
                        onClick = onLaunchGoogleSignIn
                    )

                    AuthSecondaryPillButton(
                        label = if (isEn) "Sign in with email" else "Войти по email",
                        leadingIcon = {
                            Icon(
                                imageVector = LucideIcons.Mail,
                                contentDescription = null,
                                tint = palette.textSecondary,
                                modifier = Modifier.size(17.dp)
                            )
                        },
                        onClick = { showEmailForm = true }
                    )

                    AuthOrDivider(label = if (isEn) "or" else "или")

                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(50))
                            .clickable(enabled = !busy) {
                                mode = "signup"
                                showEmailForm = true
                            },
                        shape = RoundedCornerShape(50),
                        color = palette.glassBg,
                        border = BorderStroke(1.dp, palette.glassBorder)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = if (isEn) "Create account" else "Создать аккаунт",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium,
                                color = palette.textPrimary
                            )
                            Icon(
                                imageVector = LucideIcons.ChevronRight,
                                contentDescription = null,
                                tint = palette.textMuted,
                                modifier = Modifier.size(17.dp)
                            )
                        }
                    }
                }
            } else {
                // Email Sign-In / Sign-Up / Forgot Password Form
                val fieldColors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = palette.brand,
                    unfocusedBorderColor = palette.glassBorder,
                    focusedContainerColor = palette.glassBg,
                    unfocusedContainerColor = palette.glassBg,
                    focusedTextColor = palette.textPrimary,
                    unfocusedTextColor = palette.textPrimary,
                    focusedPlaceholderColor = palette.textMuted,
                    unfocusedPlaceholderColor = palette.textMuted,
                    cursorColor = palette.brand
                )

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    // Back link
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .clickable {
                                if (isForgot) {
                                    isForgot = false
                                } else {
                                    mode = "signin"
                                    showEmailForm = false
                                }
                            }
                            .padding(vertical = 4.dp, horizontal = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            imageVector = LucideIcons.ArrowLeft,
                            contentDescription = null,
                            tint = palette.textMuted,
                            modifier = Modifier.size(15.dp)
                        )
                        Text(
                            text = if (isForgot) {
                                if (isEn) "Back" else "Назад"
                            } else {
                                if (isEn) "All sign-in options" else "Все способы входа"
                            },
                            style = MaterialTheme.typography.labelMedium,
                            color = palette.textMuted
                        )
                    }

                    if (mode == "signup" && !isForgot) {
                        GoogleSignInPillButton(
                            label = if (isEn) "Continue with Google" else "Продолжить через Google",
                            loading = state.isGoogleAuthLoading,
                            enabled = !busy,
                            onClick = onLaunchGoogleSignIn
                        )
                        AuthOrDivider(label = if (isEn) "or" else "или")

                        OutlinedTextField(
                            value = displayName,
                            onValueChange = { displayName = it },
                            placeholder = { Text(if (isEn) "Your name" else "Ваше имя") },
                            leadingIcon = {
                                Icon(LucideIcons.User, contentDescription = null, tint = palette.textMuted, modifier = Modifier.size(17.dp))
                            },
                            singleLine = true,
                            shape = RoundedCornerShape(50),
                            colors = fieldColors,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    OutlinedTextField(
                        value = email,
                        onValueChange = {
                            email = it
                            viewModel.clearAuthError()
                        },
                        placeholder = { Text("name@example.com") },
                        leadingIcon = {
                            Icon(LucideIcons.Mail, contentDescription = null, tint = palette.textMuted, modifier = Modifier.size(17.dp))
                        },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        singleLine = true,
                        shape = RoundedCornerShape(50),
                        colors = fieldColors,
                        modifier = Modifier.fillMaxWidth()
                    )

                    if (!isForgot) {
                        OutlinedTextField(
                            value = password,
                            onValueChange = {
                                password = it
                                viewModel.clearAuthError()
                            },
                            placeholder = {
                                Text(
                                    if (mode == "signup") {
                                        if (isEn) "Minimum 6 characters" else "Минимум 6 символов"
                                    } else {
                                        if (isEn) "Password" else "Пароль"
                                    }
                                )
                            },
                            leadingIcon = {
                                Icon(LucideIcons.Lock, contentDescription = null, tint = palette.textMuted, modifier = Modifier.size(17.dp))
                            },
                            trailingIcon = {
                                IconButton(onClick = { showPassword = !showPassword }) {
                                    Icon(
                                        imageVector = if (showPassword) LucideIcons.EyeOff else LucideIcons.Eye,
                                        contentDescription = null,
                                        tint = palette.textMuted,
                                        modifier = Modifier.size(17.dp)
                                    )
                                }
                            },
                            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            singleLine = true,
                            shape = RoundedCornerShape(50),
                            colors = fieldColors,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    if (mode == "signin" && !isForgot) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End
                        ) {
                            TextButton(onClick = { isForgot = true }) {
                                Text(
                                    text = if (isEn) "Forgot password?" else "Забыли пароль?",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = palette.textMuted
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(4.dp))

                    Button(
                        onClick = {
                            when {
                                isForgot -> {
                                    if (email.isNotBlank()) {
                                        viewModel.sendPasswordReset(email)
                                        isForgot = false
                                    } else {
                                        viewModel.showToast(if (isEn) "Enter your email" else "Введите email")
                                    }
                                }
                                mode == "signup" -> viewModel.signUp(email, password, displayName)
                                else -> viewModel.signIn(email, password)
                            }
                        },
                        enabled = !busy && email.isNotBlank() && (isForgot || password.length >= 6),
                        shape = RoundedCornerShape(50),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = palette.brand,
                            contentColor = palette.brandOn
                        ),
                        modifier = Modifier.fillMaxWidth().height(50.dp)
                    ) {
                        if (state.isAuthLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(19.dp),
                                strokeWidth = 2.dp,
                                color = palette.brandOn
                            )
                        } else {
                            Text(
                                text = when {
                                    isForgot -> if (isEn) "Send reset link" else "Сбросить пароль"
                                    mode == "signup" -> if (isEn) "Continue" else "Продолжить"
                                    else -> if (isEn) "Sign in" else "Войти в аккаунт"
                                },
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(28.dp))
            Text(
                text = if (isEn) {
                    "Your chats, projects, memories and Library sync directly with your IGseek account."
                } else {
                    "Чаты, проекты, память и Library синхронизируются с вашим аккаунтом IGseek."
                },
                style = MaterialTheme.typography.labelSmall,
                color = palette.textMuted,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 16.dp)
            )
            }
        }
    }
}

@Composable
private fun GoogleSignInPillButton(
    label: String,
    loading: Boolean,
    enabled: Boolean,
    onClick: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(50))
            .clickable(enabled = enabled, onClick = onClick),
        shape = RoundedCornerShape(50),
        color = palette.glassBg,
        border = BorderStroke(1.dp, palette.glassBorder)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            if (loading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = palette.brand
                )
            } else {
                GoogleGIcon(modifier = Modifier.size(18.dp))
            }
            Spacer(Modifier.width(10.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = palette.textPrimary
            )
        }
    }
}

@Composable
private fun AuthSecondaryPillButton(
    label: String,
    leadingIcon: @Composable () -> Unit,
    onClick: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(50))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(50),
        color = palette.glassBg,
        border = BorderStroke(1.dp, palette.glassBorder)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            leadingIcon()
            Spacer(Modifier.width(10.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                color = palette.textPrimary
            )
        }
    }
}

@Composable
private fun AuthOrDivider(label: String) {
    val palette = LocalIGseekPalette.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        HorizontalDivider(color = palette.divider, modifier = Modifier.weight(1f))
        Text(text = label, style = MaterialTheme.typography.labelSmall, color = palette.textMuted)
        HorizontalDivider(color = palette.divider, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun AuthPillTab(
    title: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalIGseekPalette.current
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(if (selected) palette.brand else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = if (selected) palette.brandOn else palette.textMuted
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
                .padding(horizontal = 22.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            IGseekFoxLogo(
                size = 64.dp,
                showGlow = true,
                tintOverride = if (state.layoutPrefs.darkTheme) accentSwatchColor(chosen, true) else Color(0xFF000000)
            )
            Spacer(Modifier.height(14.dp))
            Text(
                text = if (isEn) "Choose your dark theme accent" else "Выберите акцент тёмной темы",
                style = MaterialTheme.typography.headlineMedium,
                color = palette.textPrimary,
                textAlign = TextAlign.Center
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = if (isEn) {
                    "Light theme always uses pure black (#000000). This accent applies in Dark theme."
                } else {
                    "В светлой теме всегда используется чёрный акцент (#000000). Выбранный цвет применяется в тёмной теме."
                },
                style = MaterialTheme.typography.bodySmall,
                color = palette.textMuted,
                textAlign = TextAlign.Center
            )

            Spacer(Modifier.height(22.dp))

            IGseekGlassCard(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                contentPadding = 18.dp
            ) {
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    AccentPresetId.entries.forEach { preset ->
                        val swatch = accentSwatchColor(preset, darkTheme = true)
                        val active = chosen == preset
                        Surface(
                            modifier = Modifier
                                .clip(RoundedCornerShape(50))
                                .clickable {
                                    chosen = preset
                                    viewModel.updateLayoutPrefs { it.copy(accent = preset) }
                                },
                            shape = RoundedCornerShape(50),
                            color = if (active) swatch.copy(alpha = 0.16f) else palette.chipBg,
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
                                            imageVector = LucideIcons.Check,
                                            contentDescription = null,
                                            tint = if (preset == AccentPresetId.BLACK) Color.Black else Color.White,
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
                    shape = RoundedCornerShape(50),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = palette.brand,
                        contentColor = palette.brandOn
                    ),
                    modifier = Modifier.fillMaxWidth().height(50.dp)
                ) {
                    Text(
                        text = if (isEn) "Complete registration" else "Завершить регистрацию",
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}
