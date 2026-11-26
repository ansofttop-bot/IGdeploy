package app.igseek.mobile

import app.igseek.mobile.data.models.AccentPresetId
import app.igseek.mobile.data.models.AiModelId
import app.igseek.mobile.data.models.IGseekTab
import app.igseek.mobile.data.models.MobileLayoutPrefs
import org.junit.Assert.assertEquals
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
    fun defaultLayoutContainsAllFiveTabs() {
        val prefs = MobileLayoutPrefs()
        assertEquals(5, prefs.tabOrder.size)
        assertEquals(IGseekTab.CHAT, prefs.tabOrder.first())
        assertTrue(prefs.tabOrder.containsAll(IGseekTab.entries))
    }

    @Test
    fun modelIdsMatchBackendContract() {
        val ids = AiModelId.entries.map { it.apiId }
        assertTrue(ids.contains("instinct"))
        assertTrue(ids.contains("chat"))
        assertTrue(ids.contains("f1"))
    }
}
