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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.List
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.igseek.mobile.data.models.CloudSyncStatus
import app.igseek.mobile.data.models.IGseekTab
import app.igseek.mobile.ui.components.IGseekCanvas
import app.igseek.mobile.ui.components.IGseekFoxLogo
import app.igseek.mobile.ui.components.IGseekGlassChip
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

@Composable
fun IGseekAppRoot(
    state: IGseekUiState,
    viewModel: IGseekViewModel
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
            AuthScreen(state = state, viewModel = viewModel)
        }
        return
    }

    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val openDrawer: () -> Unit = { scope.launch { drawerState.open() } }
    val closeDrawer: () -> Unit = { scope.launch { drawerState.close() } }

    ModalNavigationDrawer(
        drawerState = drawerState,
        scrimColor = Color.Black.copy(alpha = 0.62f),
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
                    if (state.layoutPrefs.showBottomBar) {
                        IGseekBottomBar(
                            state = state,
                            onSelectTab = { viewModel.selectTab(it) }
                        )
                    }
                }
            ) { innerPadding ->
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(bottom = innerPadding.calculateBottomPadding())
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
            // Top Brand Row — exact match to IGseek website sidebar header
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(9.dp)
                ) {
                    IGseekFoxLogo(size = 26.dp, showGlow = false)
                    Text(
                        text = "IGseek",
                        style = MaterialTheme.typography.titleLarge,
                        color = palette.textPrimary,
                        fontWeight = FontWeight.SemiBold
                    )
                    SyncDot(status = state.cloudSyncStatus)
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (state.session != null && !state.session.isGuest) {
                        IconButton(
                            onClick = { viewModel.syncAllFromCloud() },
                            modifier = Modifier.size(34.dp)
                        ) {
                            Icon(
                                Icons.Rounded.Refresh,
                                contentDescription = "Sync",
                                tint = palette.textMuted,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                    IconButton(
                        onClick = onClose,
                        modifier = Modifier.size(34.dp)
                    ) {
                        Icon(
                            Icons.Rounded.Close,
                            contentDescription = "Close",
                            tint = palette.textMuted,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))

            // Primary "Новый чат" glass CTA button
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .clickable {
                        viewModel.createNewChat()
                        onClose()
                    },
                shape = RoundedCornerShape(14.dp),
                color = palette.brandSoft,
                border = BorderStroke(1.dp, palette.brandBorder)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        Icons.Rounded.Add,
                        contentDescription = null,
                        tint = palette.brand,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(Modifier.width(7.dp))
                    Text(
                        text = if (isEn) "New Chat" else "Новый чат",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = palette.textPrimary
                    )
                }
            }

            Spacer(Modifier.height(12.dp))

            // Scrollable Workspaces + Projects + Chats
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp)
            ) {
                // Website Primary Navigation Workspaces
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
                        icon = tabIcon(tab),
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

                // Projects (Folders) Row
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
                            Icons.Rounded.Add,
                            contentDescription = "New Project",
                            tint = palette.textMuted,
                            modifier = Modifier
                                .size(18.dp)
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

                // Search Chats Input
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
                                Icons.Rounded.Search,
                                contentDescription = null,
                                tint = palette.textMuted,
                                modifier = Modifier.size(16.dp)
                            )
                        },
                        singleLine = true,
                        textStyle = MaterialTheme.typography.bodySmall.copy(color = palette.textPrimary),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = palette.brandBorder,
                            unfocusedBorderColor = palette.glassBorder,
                            focusedContainerColor = palette.chipBg,
                            unfocusedContainerColor = palette.chipBg
                        ),
                        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)
                    )
                }

                // Chats Section Header
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
                            .clip(RoundedCornerShape(11.dp))
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
                            imageVector = if (chat.isSaved) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                            contentDescription = "Save",
                            tint = if (chat.isSaved) palette.brand else palette.textMuted.copy(alpha = 0.65f),
                            modifier = Modifier
                                .size(16.dp)
                                .clickable { viewModel.toggleSaveChat(chat.id) }
                        )
                        Spacer(Modifier.width(8.dp))
                        Icon(
                            imageVector = Icons.Rounded.Delete,
                            contentDescription = "Delete",
                            tint = palette.textMuted.copy(alpha = 0.65f),
                            modifier = Modifier
                                .size(16.dp)
                                .clickable { viewModel.deleteChat(chat.id) }
                        )
                    }
                }
            }

            // Bottom Pinned Section — Memory, Settings, Pro & User Profile
            HorizontalDivider(color = palette.divider, modifier = Modifier.padding(vertical = 8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                SidebarFooterChip(
                    icon = Icons.Rounded.Star,
                    label = IGseekTab.MEMORY.label(lang),
                    selected = state.activeTab == IGseekTab.MEMORY,
                    onClick = {
                        viewModel.selectTab(IGseekTab.MEMORY)
                        onClose()
                    },
                    modifier = Modifier.weight(1f)
                )
                SidebarFooterChip(
                    icon = Icons.Rounded.Settings,
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
                    .clip(RoundedCornerShape(13.dp))
                    .clickable {
                        viewModel.selectTab(IGseekTab.SETTINGS)
                        onClose()
                    },
                shape = RoundedCornerShape(13.dp),
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
                            text = session?.displayName?.ifBlank { "IGseek User" } ?: "Гость",
                            style = MaterialTheme.typography.labelMedium,
                            color = palette.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = if (state.subscription.isPro) "IGseek Pro" else (session?.email ?: ""),
                            style = MaterialTheme.typography.labelSmall,
                            color = if (state.subscription.isPro) palette.brand else palette.textMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = if (state.subscription.isPro) palette.brandSoft else palette.surfaceElevated,
                        border = BorderStroke(1.dp, if (state.subscription.isPro) palette.brandBorder else palette.glassBorder)
                    ) {
                        Text(
                            text = if (state.subscription.isPro) "PRO" else "FREE",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (state.subscription.isPro) palette.brand else palette.textMuted,
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp)
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
                    shape = RoundedCornerShape(12.dp),
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
            modifier = Modifier.size(19.dp)
        )
        Spacer(Modifier.width(11.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            color = if (selected) palette.textPrimary else palette.textSecondary,
            modifier = Modifier.weight(1f)
        )
        if (!badge.isNullOrBlank()) {
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = palette.chipBg,
                border = BorderStroke(1.dp, palette.glassBorder)
            ) {
                Text(
                    text = badge,
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.textMuted,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
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

@Composable
private fun SyncDot(status: CloudSyncStatus) {
    val color = when (status) {
        CloudSyncStatus.SYNCED -> Color(0xFF10B981)
        CloudSyncStatus.SYNCING -> Color(0xFFF59E0B)
        CloudSyncStatus.OFFLINE, CloudSyncStatus.ERROR -> Color(0xFFEF4444)
        CloudSyncStatus.LOCAL_ONLY, CloudSyncStatus.IDLE -> Color(0xFF71717A)
    }
    Box(
        modifier = Modifier
            .size(7.dp)
            .clip(CircleShape)
            .background(color)
    )
}

@Composable
private fun IGseekBottomBar(
    state: IGseekUiState,
    onSelectTab: (IGseekTab) -> Unit
) {
    val palette = LocalIGseekPalette.current
    val lang = state.layoutPrefs.language
    val tabs = state.layoutPrefs.tabOrder.ifEmpty {
        listOf(IGseekTab.CHAT, IGseekTab.FLOW, IGseekTab.LIBRARY, IGseekTab.ENGINE)
    }

    Surface(
        color = palette.sidebarBg.copy(alpha = 0.96f),
        border = BorderStroke(1.dp, palette.divider)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 10.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically
        ) {
            tabs.forEach { tab ->
                val selected = state.activeTab == tab
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (selected) palette.brandSoft else Color.Transparent)
                        .clickable { onSelectTab(tab) }
                        .padding(vertical = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    Icon(
                        imageVector = tabIcon(tab),
                        contentDescription = tab.label(lang),
                        tint = if (selected) palette.brand else palette.textMuted,
                        modifier = Modifier.size(20.dp)
                    )
                    Text(
                        text = tab.label(lang),
                        style = MaterialTheme.typography.labelSmall,
                        color = if (selected) palette.textPrimary else palette.textMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

fun tabIcon(tab: IGseekTab): ImageVector = when (tab) {
    IGseekTab.CHAT -> Icons.Rounded.Home
    IGseekTab.FLOW -> Icons.Rounded.PlayArrow
    IGseekTab.LIBRARY -> Icons.Rounded.List
    IGseekTab.SAVED -> Icons.Rounded.Favorite
    IGseekTab.ENGINE -> Icons.Rounded.Build
    IGseekTab.WAVE -> Icons.Rounded.Call
    IGseekTab.DOCS -> Icons.Rounded.Info
    IGseekTab.MEMORY -> Icons.Rounded.Star
    IGseekTab.SETTINGS -> Icons.Rounded.Settings
}
