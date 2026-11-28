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
import app.igseek.mobile.ui.components.IGseekFloatingDock
import app.igseek.mobile.ui.components.IGseekFoxLogo
import app.igseek.mobile.ui.components.IGseekGlassCard
import app.igseek.mobile.ui.components.IGseekGlassChip
import app.igseek.mobile.ui.components.IGseekSearchField
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
    onLaunchGoogleSignIn: () -> Unit,
    onRequestNotificationPermission: () -> Unit = {}
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
    val showDock = state.layoutPrefs.showBottomBar && state.activeTab != IGseekTab.CHAT

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
                snackbarHost = { SnackbarHost(snackbarHostState) },
                bottomBar = {
                    if (showDock) {
                        Box(modifier = Modifier.navigationBarsPadding()) {
                            IGseekFloatingDock(
                                tabs = state.layoutPrefs.tabOrder,
                                activeTab = state.activeTab,
                                lang = state.layoutPrefs.language,
                                onSelectTab = { viewModel.selectTab(it) },
                                onOpenMenu = openDrawer
                            )
                        }
                    }
                }
            ) { innerPadding ->
                val bottomInset = if (showDock) innerPadding.calculateBottomPadding() else 0.dp
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(bottom = bottomInset)
                ) {
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
                            viewModel = viewModel,
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
                            onOpenDrawer = openDrawer,
                            onRequestNotificationPermission = onRequestNotificationPermission
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
        modifier = Modifier.width(308.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxHeight()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 14.dp, vertical = 12.dp)
        ) {
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
                    modifier = Modifier.size(38.dp)
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

            // Primary "New Chat" action
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .clickable {
                        viewModel.createNewChat()
                        onClose()
                    },
                shape = RoundedCornerShape(14.dp),
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

            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                val primaryWorkspaces = listOf(
                    IGseekTab.CHAT,
                    IGseekTab.FLOW,
                    IGseekTab.LIBRARY,
                    IGseekTab.ENGINE,
                    IGseekTab.SAVED,
                    IGseekTab.WAVE,
                    IGseekTab.DOCS
                )
                items(primaryWorkspaces, key = { "nav_${it.key}" }) { tab ->
                    val meta = when (tab) {
                        IGseekTab.LIBRARY -> state.libraryFiles.size.takeIf { it > 0 }?.toString()
                        IGseekTab.ENGINE -> state.engineProjects.size.takeIf { it > 0 }?.toString()
                        IGseekTab.SAVED -> (state.chats.count { it.isSaved } + state.bookmarkedMessages.size)
                            .takeIf { it > 0 }?.toString()
                        IGseekTab.WAVE -> "SOON"
                        else -> null
                    }
                    SidebarNavRow(
                        icon = tabLucideIcon(tab),
                        label = tab.label(lang),
                        selected = state.activeTab == tab,
                        metaText = meta,
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
                            text = if (isEn) "Folders" else "Папки",
                            style = MaterialTheme.typography.labelMedium,
                            color = palette.textMuted
                        )
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { showNewProjectDialog = true }
                                .padding(horizontal = 6.dp, vertical = 3.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                imageVector = LucideIcons.Plus,
                                contentDescription = "New Folder",
                                tint = palette.textMuted,
                                modifier = Modifier.size(14.dp)
                            )
                            Text(
                                text = if (isEn) "Add" else "Новая",
                                style = MaterialTheme.typography.labelSmall,
                                color = palette.textMuted
                            )
                        }
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
                    IGseekSearchField(
                        query = searchQuery,
                        onQueryChange = { searchQuery = it },
                        placeholder = if (isEn) "Search chats…" else "Поиск чатов…",
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                }

                item(key = "chats_header") {
                    Text(
                        text = if (isEn) "Recent chats" else "Недавние чаты",
                        style = MaterialTheme.typography.labelMedium,
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
                            .padding(horizontal = 10.dp, vertical = 9.dp),
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
                        Spacer(Modifier.width(10.dp))
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

            HorizontalDivider(color = palette.divider, modifier = Modifier.padding(vertical = 8.dp))

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
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
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
                                text = if (isEn) "Activate" else "По ключу",
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
            val displayName = session?.displayName?.ifBlank { "IGseek User" } ?: "IGseek"
            val initial = displayName.firstOrNull()?.uppercaseChar()?.toString() ?: "I"
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
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .background(if (state.subscription.isPro) palette.brandSoft else palette.surfaceElevated),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = initial,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = if (state.subscription.isPro) palette.brand else palette.textPrimary
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = displayName,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = palette.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        val planSuffix = if (state.subscription.isPro) "Pro" else "Free"
                        Text(
                            text = "${session?.email?.ifBlank { if (isEn) "Guest" else "Гость" } ?: ""} · $planSuffix",
                            style = MaterialTheme.typography.labelSmall,
                            color = palette.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    Icon(
                        imageVector = LucideIcons.ChevronRight,
                        contentDescription = null,
                        tint = palette.textMuted,
                        modifier = Modifier.size(15.dp)
                    )
                }
            }
        }
    }

    if (showNewProjectDialog) {
        AlertDialog(
            onDismissRequest = { showNewProjectDialog = false },
            containerColor = palette.surfaceElevated,
            title = { Text(if (isEn) "New Folder" else "Новая папка", color = palette.textPrimary) },
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
                        .size(38.dp)
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
                        "⚔️ AI Council — 2 parallel expert minds analyze your question and synthesize one verified Master Answer",
                        "✨ 1-Click Magic Prompt Enhancer — turns a rough 3-word draft into an expert prompt right in the chat bar",
                        "🔊 Voice Read-Aloud — listen to any IGseek answer aloud in RU/EN with 1 tap",
                        "📜 Reply Version History — long-press Retry after regeneration to switch back to any previous reply",
                        "Unlimited Photos, Flow, Engine & Cloud Memory (Free: 5 photos/24h, 4 Flow & 4 Engine/12h, 12 memories; Chat always unlimited)",
                        "Deep Reasoning, Pro Agents (Code, Hacker, Creative), reference photo editing & 30 days per key"
                    )
                } else {
                    listOf(
                        "⚔️ Совет ИИ — 2 независимых эксперта одновременно разбирают задачу и собирают единый выверенный ответ",
                        "✨ Усиление промпта в 1 клик — превращает черновик из пары слов в сильный экспертный запрос прямо в строке ввода",
                        "🔊 Озвучка ответов ИИ — слушайте любой ответ IGseek вслух одним нажатием (RU/EN)",
                        "📜 История вариантов ответа — зажмите «Ещё раз» после регенерации, чтобы вернуться к прошлым ответам",
                        "Безлимит на Фото, Flow, Engine и Память (Free: 5 фото/24ч, 4 Flow и 4 Engine/12ч, 12 фактов памяти; Чат всегда безлимитный)",
                        "Deep Reasoning, спецагенты (Code, Hacker, Creative), редактирование фото по референсу · 30 дней по ключу"
                    )
                }
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    perks.forEach { perk ->
                        Row(
                            verticalAlignment = Alignment.Top,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(LucideIcons.Check, contentDescription = null, tint = palette.brand, modifier = Modifier.padding(top = 2.dp).size(15.dp))
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
                    color = palette.danger
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
    metaText: String?,
    onClick: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (selected) palette.brandSoft else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 11.dp, vertical = 10.dp),
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
        if (!metaText.isNullOrBlank()) {
            Text(
                text = metaText,
                style = MaterialTheme.typography.labelSmall,
                color = if (selected) palette.brand else palette.textMuted
            )
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
    IGseekTab.DOCS -> LucideIcons.FileText
    IGseekTab.MEMORY -> LucideIcons.Brain
    IGseekTab.SETTINGS -> LucideIcons.Settings
}
