package app.igseek.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.List
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.igseek.mobile.data.models.IGseekTab
import app.igseek.mobile.ui.screens.AuthScreen
import app.igseek.mobile.ui.screens.ChatScreen
import app.igseek.mobile.ui.screens.FlowScreen
import app.igseek.mobile.ui.screens.LibraryScreen
import app.igseek.mobile.ui.screens.MemoryScreen
import app.igseek.mobile.ui.screens.SettingsScreen
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel

@Composable
fun IGseekAppRoot(state: IGseekUiState, viewModel: IGseekViewModel) {
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.toastMessage) {
        val msg = state.toastMessage
        if (!msg.isNullOrBlank()) {
            snackbarHostState.showSnackbar(msg)
            viewModel.consumeToast()
        }
    }

    if (state.session == null) {
        Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { padding ->
            Box(modifier = Modifier.fillMaxSize().padding(padding)) {
                AuthScreen(
                    state = state,
                    onSignIn = viewModel::signIn,
                    onSignUp = viewModel::signUp,
                    onPasswordReset = viewModel::sendPasswordReset,
                    onContinueAsGuest = viewModel::continueAsGuest,
                    onUpdateServerUrl = viewModel::updateServerBaseUrl
                )
            }
        }
        return
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                state.layoutPrefs.tabOrder.forEach { tab ->
                    NavigationBarItem(
                        selected = state.activeTab == tab,
                        onClick = { viewModel.selectTab(tab) },
                        icon = { Icon(iconForTab(tab), contentDescription = tab.labelRu) },
                        label = { Text(tab.labelRu, style = MaterialTheme.typography.labelMedium) }
                    )
                }
            }
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (!state.isOnline || state.outboxCount > 0) {
                Row(
                    modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.primaryContainer).padding(horizontal = 14.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(Icons.Rounded.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                    Text(
                        text = if (!state.isOnline) "Офлайн-режим • в очереди: ${state.outboxCount}" else "Синхронизация очереди сообщений (${state.outboxCount})...",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }

            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                when (state.activeTab) {
                    IGseekTab.CHAT -> ChatScreen(state = state, viewModel = viewModel)
                    IGseekTab.FLOW -> FlowScreen(state = state, onPlanGoal = viewModel::planFlowGoal, onRunAllSteps = viewModel::runAllFlowSteps)
                    IGseekTab.LIBRARY -> LibraryScreen(
                        state = state,
                        onRefresh = viewModel::refreshLibrary,
                        onUpload = viewModel::uploadToLibrary,
                        onDelete = viewModel::deleteFromLibrary
                    )
                    IGseekTab.MEMORY -> MemoryScreen(
                        state = state,
                        onRefresh = viewModel::refreshMemories,
                        onAddMemory = viewModel::addMemory,
                        onDeleteMemory = viewModel::deleteMemory
                    )
                    IGseekTab.SETTINGS -> SettingsScreen(state = state, viewModel = viewModel)
                }
            }
        }
    }

    state.incomingShare?.let { shared ->
        AlertDialog(
            onDismissRequest = viewModel::dismissIncomingShare,
            title = { Text("Получено из другого приложения") },
            text = { Text(shared.attachment?.name ?: shared.text?.take(140) ?: "Выберите действие") },
            confirmButton = { TextButton(onClick = { viewModel.applyIncomingShareToChat(shared) }) { Text("Отправить в Чат") } },
            dismissButton = { TextButton(onClick = { viewModel.saveIncomingShareToLibrary(shared) }) { Text("Сохранить в Library") } }
        )
    }
}

private fun iconForTab(tab: IGseekTab) = when (tab) {
    IGseekTab.CHAT -> Icons.Rounded.Home
    IGseekTab.FLOW -> Icons.Rounded.Build
    IGseekTab.LIBRARY -> Icons.AutoMirrored.Rounded.List
    IGseekTab.MEMORY -> Icons.Rounded.Favorite
    IGseekTab.SETTINGS -> Icons.Rounded.Settings
}
