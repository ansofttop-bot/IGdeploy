package app.igseek.mobile.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.igseek.mobile.data.models.IGseekTab
import app.igseek.mobile.ui.components.IGseekCanvas
import app.igseek.mobile.ui.components.IGseekFoxLogo
import app.igseek.mobile.ui.components.IGseekGlassCard
import app.igseek.mobile.ui.components.IGseekGlassChip
import app.igseek.mobile.ui.components.IGseekWordmark
import app.igseek.mobile.ui.components.LucideIcons
import app.igseek.mobile.ui.screens.AuthScreen
import app.igseek.mobile.ui.screens.ChatScreen
import app.igseek.mobile.ui.screens.DocsScreen
import app.igseek.mobile.ui.screens.EngineScreen
import app.igseek.mobile.ui.screens.FlowScreen
import app.igseek.mobile.ui.screens.LibraryScreen
import app.igseek.mobile.ui.screens.MemoryScreen
import app.igseek.mobile.ui.screens.SavedScreen
import app.igseek.mobile.ui.screens.SettingsScreen
import app.igseek.mobile.ui.screens.WaveScreen
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.LocalIGseekPalette
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IGseekAppRoot(
    state: IGseekUiState,
    viewModel: IGseekViewModel,
    onLaunchGoogleSignIn: () -> Unit
) {
    val snackbarHostState = remember { SnackbarHostState() }
    val palette = LocalIGseekPalette.current

    LaunchedEffect(state.toastMessage) {
        val msg = state.toastMessage
        if (!msg.isNullOrBlank()) {
            snackbarHostState.showSnackbar(msg)
            viewModel.consumeToast()
        }
    }

    if (state.session == null || state.needsAccentOnboarding) {
        Scaffold(
            containerColor = palette.bg,
            snackbarHost = { SnackbarHost(snackbarHostState) }
        ) { _ ->
            AuthScreen(
                state = state,
                viewModel = viewModel,
                onLaunchGoogleSignIn = onLaunchGoogleSignIn
            )
        }
        return
    }

    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val openDrawer: () -> Unit = { scope.launch { drawerState.open() } }
    val closeDrawer: () -> Unit = { scope.launch { drawerState.close() } }

    ModalNavigationDrawer(
        drawerState = drawerState,
        scrimColor = Color.Black.copy(alpha = 0.56f),
        drawerContent = {
            IGseekSidebarDrawer(
                state = state,
                viewModel = viewModel,
                onClose = closeDrawer
            )
        }
    ) {
        IGseekCanvas {
            Scaffold(
                containerColor = Color.Transparent,
                snackbarHost = { SnackbarHost(snackbarHostState) }
            ) { _ ->
                Box(modifier = Modifier.fillMaxSize()) {
                    when (state.activeTab) {
                        IGseekTab.CHAT -> ChatScreen(
                            state = state,
                            viewModel = viewModel,
                            onOpenDrawer = openDrawer
                        )
                        IGseekTab.FLOW -> FlowScreen(
                            state = state,
                            viewModel = viewModel,
                            onOpenDrawer = openDrawer
                        )
                        IGseekTab.LIBRARY -> LibraryScreen(
                            state = state,
                            viewModel = viewModel,
                            onOpenDrawer = openDrawer
                        )
                        IGseekTab.SAVED -> SavedScreen(
                            state = state,
                            viewModel = viewModel,
                            onOpenDrawer = openDrawer
                        )
                        IGseekTab.ENGINE -> EngineScreen(
                            state = state,
                            viewModel = viewModel,
                            onOpenDrawer = openDrawer
                        )
                        IGseekTab.WAVE -> WaveScreen(
                            state = state,
                            onOpenDrawer = openDrawer,
                            onBackToChat = { viewModel.selectTab(IGseekTab.CHAT) }
                        )
                        IGseekTab.DOCS -> DocsScreen(
                            state = state,
                            viewModel = viewModel,
                            onOpenDrawer = openDrawer
                        )
                        IGseekTab.MEMORY -> MemoryScreen(
                            state = state,
                            viewModel = viewModel,
                            onOpenDrawer = openDrawer
                        )
                        IGseekTab.SETTINGS -> SettingsScreen(
                            state = state,
                            viewModel = viewModel,
                            onOpenDrawer = openDrawer
                        )
                    }
                }
            }
        }
    }

    if (state.showProSheet) {
        ProSubscriptionSheet(
            state = state,
            viewModel = viewModel,
            onDismiss = { viewModel.closeProSheet() }
        )
    }
}

@Composable
private fun IGseekSidebarDrawer(
    state: IGseekUiState,
    viewModel: IGseekViewModel,
    onClose: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val lang = state.layoutPrefs.language
    val isEn = lang == "en"
    var searchQuery by remember { mutableStateOf("") }
    var showNewProjectDialog by remember { mutableStateOf(false) }
    var newProjectName by remember { mutableStateOf("") }

    val filteredChats = remember(state.chats, state.activeProjectId, searchQuery) {
        state.chats.filter { chat ->
            val matchProject = state.activeProjectId == null || chat.projectId == state.activeProjectId
            val matchQuery = searchQuery.isBlank() || chat.title.contains(searchQuery, ignoreCase = true)
            matchProject && matchQuery
        }
    }

    ModalDrawerSheet(
        drawerContainerColor = palette.sidebarBg,
        drawerContentColor = palette.textPrimary,
        modifier = Modifier.width(304.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxHeight()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 14.dp, vertical = 12.dp)
        ) {
            // Clean Website-Style Sidebar Header (no cluttered status dot)
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(9.dp)
                ) {
                    IGseekFoxLogo(size = 24.dp, showGlow = false)
                    IGseekWordmark(fontSize = 20.sp)
                }

                IconButton(
                    onClick = onClose,
                    modifier = Modifier.size(34.dp)
                ) {
                    Icon(
                        imageVector = LucideIcons.X,
                        contentDescription = "Close",
                        tint = palette.textMuted,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            // Pill "Новый чат" button matching website
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(50))
                    .clickable {
                        viewModel.createNewChat()
                        onClose()
                    },
                shape = RoundedCornerShape(50),
                color = if (palette.isDark) palette.brandSoft else palette.brand,
                border = BorderStroke(1.dp, palette.brandBorder)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = LucideIcons.SquarePen,
                        contentDescription = null,
                        tint = if (palette.isDark) palette.brand else palette.brandOn,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = if (isEn) "New Chat" else "Новый чат",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = if (palette.isDark) palette.textPrimary else palette.brandOn
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            // Scrollable Workspaces + Projects + Chats
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                val primaryWorkspaces = listOf(
                    IGseekTab.CHAT,
                    IGseekTab.FLOW,
                    IGseekTab.LIBRARY,
                    IGseekTab.SAVED,
                    IGseekTab.ENGINE,
                    IGseekTab.WAVE,
                    IGseekTab.DOCS
                )
                items(primaryWorkspaces, key = { "nav_${it.key}" }) { tab ->
                    SidebarNavRow(
                        icon = tabLucideIcon(tab),
                        label = tab.label(lang),
                        selected = state.activeTab == tab,
                        badge = when (tab) {
                            IGseekTab.WAVE -> if (isEn) "Soon" else "Скоро"
                            IGseekTab.SAVED -> {
                                val count = state.chats.count { it.isSaved } + state.bookmarkedMessages.size
                                if (count > 0) count.toString() else null
                            }
                            else -> null
                        },
                        onClick = {
                            viewModel.selectTab(tab)
                            onClose()
                        }
                    )
                }

                item(key = "divider_projects") {
                    HorizontalDivider(
                        color = palette.divider,
                        modifier = Modifier.padding(vertical = 10.dp)
                    )
                }

                // Projects (Folders)
                item(key = "projects_header") {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = if (isEn) "PROJECTS" else "ПРОЕКТЫ",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.textMuted
                        )
                        Icon(
                            imageVector = LucideIcons.Plus,
                            contentDescription = "New Project",
                            tint = palette.textMuted,
                            modifier = Modifier
                                .size(17.dp)
                                .clip(CircleShape)
                                .clickable { showNewProjectDialog = true }
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        IGseekGlassChip(
                            label = if (isEn) "All" else "Все",
                            selected = state.activeProjectId == null,
                            onClick = { viewModel.selectProject(null) }
                        )
                        state.projects.forEach { proj ->
                            IGseekGlassChip(
                                label = proj.name,
                                selected = state.activeProjectId == proj.id,
                                onClick = { viewModel.selectProject(proj.id) }
                            )
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                }

                // Search Chats
                item(key = "chat_search") {
                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        placeholder = {
                            Text(
                                text = if (isEn) "Search chats…" else "Поиск чатов…",
                                style = MaterialTheme.typography.bodySmall,
                                color = palette.textMuted
                            )
                        },
                        leadingIcon = {
                            Icon(
                                imageVector = LucideIcons.Search,
                                contentDescription = null,
                                tint = palette.textMuted,
                                modifier = Modifier.size(15.dp)
                            )
                        },
                        singleLine = true,
                        textStyle = MaterialTheme.typography.bodySmall.copy(color = palette.textPrimary),
                        shape = RoundedCornerShape(50),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = palette.brandBorder,
                            unfocusedBorderColor = palette.glassBorder,
                            focusedContainerColor = palette.chipBg,
                            unfocusedContainerColor = palette.chipBg
                        ),
                        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                    )
                }

                item(key = "chats_header") {
                    Text(
                        text = if (isEn) "RECENT CHATS" else "НЕДАВНИЕ ЧАТЫ",
                        style = MaterialTheme.typography.labelSmall,
                        color = palette.textMuted,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp)
                    )
                }

                items(filteredChats, key = { "chat_${it.id}" }) { chat ->
                    val isSelected = state.activeTab == IGseekTab.CHAT && chat.id == state.activeChatId
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (isSelected) palette.brandSoft else Color.Transparent)
                            .clickable {
                                viewModel.selectChat(chat.id)
                                onClose()
                            }
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = chat.title,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (isSelected) palette.textPrimary else palette.textSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f)
                        )
                        Icon(
                            imageVector = if (chat.isSaved) LucideIcons.BookmarkFilled else LucideIcons.Bookmark,
                            contentDescription = "Save",
                            tint = if (chat.isSaved) palette.brand else palette.textMuted.copy(alpha = 0.65f),
                            modifier = Modifier
                                .size(15.dp)
                                .clickable { viewModel.toggleSaveChat(chat.id) }
                        )
                        Spacer(Modifier.width(9.dp))
                        Icon(
                            imageVector = LucideIcons.Trash2,
                            contentDescription = "Delete",
                            tint = palette.textMuted.copy(alpha = 0.65f),
                            modifier = Modifier
                                .size(15.dp)
                                .clickable { viewModel.deleteChat(chat.id) }
                        )
                    }
                }
            }

            // Bottom Pinned Footer
            HorizontalDivider(color = palette.divider, modifier = Modifier.padding(vertical = 8.dp))

            // Small, unobtrusive IGseek Pro subscription button (Requirement #4)
            if (!state.subscription.isPro) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 8.dp)
                        .clip(RoundedCornerShape(13.dp))
                        .clickable {
                            onClose()
                            viewModel.openProSheet()
                        },
                    shape = RoundedCornerShape(13.dp),
                    color = palette.brandSoft,
                    border = BorderStroke(1.dp, palette.brandBorder)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 11.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = LucideIcons.Crown,
                                contentDescription = null,
                                tint = palette.brand,
                                modifier = Modifier.size(15.dp)
                            )
                            Text(
                                text = "IGseek Pro",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = palette.textPrimary
                            )
                        }
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(3.dp)
                        ) {
                            Text(
                                text = if (isEn) "Key" else "По ключу",
                                style = MaterialTheme.typography.labelSmall,
                                color = palette.textMuted
                            )
                            Icon(
                                imageVector = LucideIcons.ChevronRight,
                                contentDescription = null,
                                tint = palette.textMuted,
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                SidebarFooterChip(
                    icon = LucideIcons.Brain,
                    label = IGseekTab.MEMORY.label(lang),
                    selected = state.activeTab == IGseekTab.MEMORY,
                    onClick = {
                        viewModel.selectTab(IGseekTab.MEMORY)
                        onClose()
                    },
                    modifier = Modifier.weight(1f)
                )
                SidebarFooterChip(
                    icon = LucideIcons.Settings,
                    label = IGseekTab.SETTINGS.label(lang),
                    selected = state.activeTab == IGseekTab.SETTINGS,
                    onClick = {
                        viewModel.selectTab(IGseekTab.SETTINGS)
                        onClose()
                    },
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(Modifier.height(8.dp))

            val session = state.session
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .clickable {
                        viewModel.selectTab(IGseekTab.SETTINGS)
                        onClose()
                    },
                shape = RoundedCornerShape(14.dp),
                color = palette.chipBg,
                border = BorderStroke(1.dp, palette.glassBorder)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 11.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = session?.displayName?.ifBlank { "IGseek User" } ?: "IGseek",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = palette.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = session?.email ?: "",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    Surface(
                        shape = RoundedCornerShape(50),
                        color = if (state.subscription.isPro) palette.brand else palette.surfaceElevated,
                        border = BorderStroke(1.dp, if (state.subscription.isPro) palette.brand else palette.glassBorder)
                    ) {
                        Text(
                            text = if (state.subscription.isPro) "PRO" else "FREE",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (state.subscription.isPro) palette.brandOn else palette.textMuted,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                        )
                    }
                }
            }
        }
    }

    if (showNewProjectDialog) {
        AlertDialog(
            onDismissRequest = { showNewProjectDialog = false },
            containerColor = palette.surfaceElevated,
            title = { Text(if (isEn) "New Project Folder" else "Новый проект", color = palette.textPrimary) },
            text = {
                OutlinedTextField(
                    value = newProjectName,
                    onValueChange = { newProjectName = it },
                    placeholder = { Text(if (isEn) "Work, Study, Startup…" else "Работа, Учёба, Стартап…") },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.createProject(newProjectName)
                        newProjectName = ""
                        showNewProjectDialog = false
                    }
                ) {
                    Text(if (isEn) "Create" else "Создать", color = palette.brand)
                }
            },
            dismissButton = {
                TextButton(onClick = { showNewProjectDialog = false }) {
                    Text(if (isEn) "Cancel" else "Отмена", color = palette.textMuted)
                }
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProSubscriptionSheet(
    state: IGseekUiState,
    viewModel: IGseekViewModel,
    onDismiss: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val sub = state.subscription
    val isEn = state.layoutPrefs.language == "en"
    var licenseKey by remember { mutableStateOf("") }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = palette.sidebarBg,
        contentColor = palette.textPrimary
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(36.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(palette.brandSoft),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(LucideIcons.Crown, contentDescription = null, tint = palette.brand, modifier = Modifier.size(18.dp))
                }
                Column {
                    Text("IGseek Pro", style = MaterialTheme.typography.titleLarge, color = palette.textPrimary)
                    Text(
                        text = if (isEn) "Activation key · ${sub.durationDays} days" else "Активация по ключу · ${sub.durationDays} дней",
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.textMuted
                    )
                }
            }

            if (sub.isPro) {
                Text(
                    text = if (sub.daysLeft > 3650) {
                        if (isEn) "IGseek Pro is active permanently." else "Подписка IGseek Pro активна бессрочно."
                    } else {
                        if (isEn) "Active · Days remaining: ${sub.daysLeft}" else "Подписка активна · Осталось дней: ${sub.daysLeft}"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = palette.brand,
                    fontWeight = FontWeight.Medium
                )
            }

            IGseekGlassCard(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                contentPadding = 14.dp
            ) {
                val perks = if (isEn) {
                    listOf(
                        "More advanced models & deep reasoning across all tabs",
                        "High-quality image generation & reference photo editing",
                        "Priority Flow & Engine processing · 30 days per key"
                    )
                } else {
                    listOf(
                        "Продвинутый уровень моделей и глубокое рассуждение",
                        "Высококачественная генерация и редактирование фото",
                        "Приоритетная работа Flow и Engine · 30 дней по ключу"
                    )
                }
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    perks.forEach { perk ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(LucideIcons.Check, contentDescription = null, tint = palette.brand, modifier = Modifier.size(15.dp))
                            Text(perk, style = MaterialTheme.typography.bodySmall, color = palette.textSecondary)
                        }
                    }
                }
            }

            OutlinedTextField(
                value = licenseKey,
                onValueChange = { raw ->
                    licenseKey = raw.uppercase().filter { it in 'A'..'Z' || it in '0'..'9' || it == '-' }.take(24)
                    if (state.keyRedeemError != null) viewModel.clearKeyRedeemError()
                },
                label = {
                    Text(
                        if (sub.isPro) {
                            if (isEn) "Extension key (+30 days)" else "Ключ продления (+30 дней)"
                        } else {
                            if (isEn) "License key" else "Ключ активации"
                        }
                    )
                },
                placeholder = { Text("IGSK-XXXX-XXXX-XXXX", color = palette.textMuted) },
                singleLine = true,
                enabled = !state.isRedeemingKey,
                textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                shape = RoundedCornerShape(14.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = palette.brand,
                    unfocusedBorderColor = palette.glassBorder,
                    focusedTextColor = palette.textPrimary,
                    unfocusedTextColor = palette.textPrimary,
                    cursorColor = palette.brand
                ),
                modifier = Modifier.fillMaxWidth()
            )

            val err = state.keyRedeemError
            if (!err.isNullOrBlank()) {
                Text(
                    text = err,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFFEF4444)
                )
            }

            Button(
                onClick = { viewModel.redeemLicenseKey(licenseKey) { licenseKey = "" } },
                enabled = !state.isRedeemingKey && licenseKey.isNotBlank(),
                shape = RoundedCornerShape(50),
                colors = ButtonDefaults.buttonColors(
                    containerColor = palette.brand,
                    contentColor = palette.brandOn
                ),
                modifier = Modifier.fillMaxWidth().height(48.dp)
            ) {
                if (state.isRedeemingKey) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = palette.brandOn
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(if (isEn) "Activating…" else "Активация…", fontWeight = FontWeight.SemiBold)
                } else {
                    Icon(LucideIcons.Crown, contentDescription = null, modifier = Modifier.size(17.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = if (sub.isPro) {
                            if (isEn) "Extend Pro (+30 days)" else "Продлить Pro (+30 дней)"
                        } else {
                            if (isEn) "Activate key" else "Активировать ключ"
                        },
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            Text(
                text = if (isEn) {
                    "Each key is single-use: activates 30 days of Pro and becomes permanently invalid."
                } else {
                    "Ключ одноразовый: активирует 30 дней IGseek Pro и после использования деактивируется."
                },
                style = MaterialTheme.typography.labelSmall,
                color = palette.textMuted
            )
            Spacer(Modifier.height(10.dp))
        }
    }
}

@Composable
private fun SidebarNavRow(
    icon: ImageVector,
    label: String,
    selected: Boolean,
    badge: String?,
    onClick: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) palette.brandSoft else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 11.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = if (selected) palette.brand else palette.textMuted,
            modifier = Modifier.size(18.dp)
        )
        Spacer(Modifier.width(12.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            color = if (selected) palette.textPrimary else palette.textSecondary,
            modifier = Modifier.weight(1f)
        )
        if (!badge.isNullOrBlank()) {
            Surface(
                shape = RoundedCornerShape(50),
                color = palette.chipBg,
                border = BorderStroke(1.dp, palette.glassBorder)
            ) {
                Text(
                    text = badge,
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.textMuted,
                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp)
                )
            }
        }
    }
}

@Composable
private fun SidebarFooterChip(
    icon: ImageVector,
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val palette = LocalIGseekPalette.current
    Surface(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = if (selected) palette.brandSoft else palette.chipBg,
        border = BorderStroke(1.dp, if (selected) palette.brandBorder else palette.glassBorder)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = if (selected) palette.brand else palette.textMuted,
                modifier = Modifier.size(16.dp)
            )
            Spacer(Modifier.width(6.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = if (selected) palette.textPrimary else palette.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

fun tabLucideIcon(tab: IGseekTab): ImageVector = when (tab) {
    IGseekTab.CHAT -> LucideIcons.MessageSquare
    IGseekTab.FLOW -> LucideIcons.Workflow
    IGseekTab.LIBRARY -> LucideIcons.Library
    IGseekTab.SAVED -> LucideIcons.Bookmark
    IGseekTab.ENGINE -> LucideIcons.Code2
    IGseekTab.WAVE -> LucideIcons.AudioLines
    IGseekTab.DOCS -> LucideIcons.FileCode
    IGseekTab.MEMORY -> LucideIcons.Brain
    IGseekTab.SETTINGS -> LucideIcons.Settings
}
