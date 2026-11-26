package app.igseek.mobile

import app.igseek.mobile.data.models.AccentPresetId
import app.igseek.mobile.data.models.AgentRoleId
import app.igseek.mobile.data.models.AiModelId
import app.igseek.mobile.data.models.IGseekTab
import app.igseek.mobile.data.models.MobileLayoutPrefs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelsUnitTest {

    @Test
    fun accentPresetFallbackWorks() {
        assertEquals(AccentPresetId.EMERALD, AccentPresetId.fromId("emerald"))
        assertEquals(AccentPresetId.DEFAULT, AccentPresetId.fromId("unknown_id"))
        assertEquals(AccentPresetId.DEFAULT, AccentPresetId.fromId(null))
        assertEquals(9, AccentPresetId.entries.size)
    }

    @Test
    fun defaultLayoutHasFourQuickBarTabsAndAllNineWorkspacesExist() {
        val prefs = MobileLayoutPrefs()
        assertFalse(prefs.showBottomBar)
        assertEquals(4, prefs.tabOrder.size)
        assertEquals(IGseekTab.CHAT, prefs.tabOrder.first())
        assertEquals(9, IGseekTab.entries.size)
        assertTrue(IGseekTab.entries.contains(IGseekTab.SAVED))
        assertTrue(IGseekTab.entries.contains(IGseekTab.ENGINE))
        assertTrue(IGseekTab.entries.contains(IGseekTab.WAVE))
        assertTrue(IGseekTab.entries.contains(IGseekTab.DOCS))
    }

    @Test
    fun togglingLightThemePreservesSavedDarkAccent() {
        val darkPrefs = MobileLayoutPrefs(darkTheme = true, accent = AccentPresetId.PURPLE)
        val lightPrefs = darkPrefs.copy(darkTheme = false)
        assertEquals(AccentPresetId.PURPLE, lightPrefs.accent)
        assertEquals(AccentPresetId.PURPLE, lightPrefs.copy(darkTheme = true).accent)
    }

    @Test
    fun modelAndAgentIdsMatchWebsiteContract() {
        val ids = AiModelId.entries.map { it.apiId }
        assertTrue(ids.contains("instinct"))
        assertTrue(ids.contains("chat"))
        assertTrue(ids.contains("f1"))
        assertEquals(6, AgentRoleId.entries.size)
    }

    @Test
    fun authSessionDistinguishesCloudFromLocalEmailAndGuest() {
        val cloud = app.igseek.mobile.data.models.AuthSession(
            uid = "fb_uid_1",
            email = "user@gmail.com",
            displayName = "User",
            idToken = "eyJhbGciOiJSUzI1NiJ9.payload.sig",
            refreshToken = "refresh_1",
            expiresAtMs = Long.MAX_VALUE,
            isGuest = false
        )
        val localEmail = cloud.copy(uid = "local_123", idToken = "", refreshToken = "")
        val guest = cloud.copy(uid = "local_guest", idToken = "", isGuest = true)

        assertTrue(cloud.isCloudSynced)
        assertFalse(localEmail.isCloudSynced)
        assertFalse(guest.isCloudSynced)
    }
}
