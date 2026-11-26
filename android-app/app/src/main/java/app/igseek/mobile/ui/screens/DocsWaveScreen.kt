package app.igseek.mobile.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Call
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.igseek.mobile.ui.components.IGseekFoxLogo
import app.igseek.mobile.ui.components.IGseekGlassCard
import app.igseek.mobile.ui.state.IGseekUiState
import app.igseek.mobile.ui.state.IGseekViewModel
import app.igseek.mobile.ui.theme.LocalIGseekPalette

private data class DocGuideItem(
    val title: String,
    val description: String,
    val promptToTry: String
)

@Composable
fun DocsScreen(
    state: IGseekUiState,
    viewModel: IGseekViewModel,
    onOpenDrawer: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val isEn = state.layoutPrefs.language == "en"

    val guides = if (isEn) {
        listOf(
            DocGuideItem(
                "Direct API & Cloud Sync",
                "IGseek Android connects directly to your IGseek cloud account and AI APIs — no website wrapper required. Chats, Projects, Memories, Library and Engine stay synced.",
                "Summarize the key principles of clean mobile-first software architecture."
            ),
            DocGuideItem(
                "Web Search Grounding",
                "Enable the Search toggle inside the composer to fetch live web snippets and clickable sources directly inside the answer.",
                "Find the latest developments in solid-state batteries and summarize key milestones."
            ),
            DocGuideItem(
                "Image Creation",
                "Toggle Image mode in the composer (or type /img followed by a prompt) to generate high-resolution visuals and save them to Library.",
                "/img minimal obsidian dark wallpaper with subtle crimson geometric light waves"
            ),
            DocGuideItem(
                "Reasoning Mode & F1",
                "Turn on Think mode or switch to IGseek F1 to view the step-by-step reasoning accordion above the final answer.",
                "Solve a classic logic puzzle step by step and explain each deduction clearly."
            ),
            DocGuideItem(
                "Autonomous Flow & Engine",
                "Use Flow to break big goals into multi-step plans and execute them automatically, or open Engine to generate complete multi-file code projects.",
                "Design a 7-day sprint plan to ship a mobile MVP with crisp milestones."
            )
        )
    } else {
        listOf(
            DocGuideItem(
                "Прямая работа по API и облако",
                "IGseek для Android делает прямые запросы к ИИ API и синхронизирует чаты, проекты, память, Library и Engine напрямую с вашим аккаунтом — без привязки к сайту.",
                "Объясни главные преимущества нативных мобильных приложений перед веб-обёртками."
            ),
            DocGuideItem(
                "Веб-поиск с источниками",
                "Включите переключатель «Поиск» в поле ввода чата, чтобы IGseek находил актуальные данные в сети и прикреплял кликабельные источники.",
                "Найди актуальные факты о развитии твердотельных аккумуляторов и сделай краткую сводку."
            ),
            DocGuideItem(
                "Генерация изображений",
                "Нажмите «Фото» в строке ввода или начните запрос с /img — картинка создастся напрямую и автоматически сохранится в Library.",
                "/img минималистичная тёмная 3D-иллюстрация красной лисы в стиле матового стекла"
            ),
            DocGuideItem(
                "Режим мышления и IGseek F1",
                "Активируйте «Мысли» или выберите модель IGseek F1, чтобы видеть подробный ход рассуждений перед финальным ответом.",
                "Разбери по шагам сложную логическую задачу и проверь ответ на ошибки."
            ),
            DocGuideItem(
                "Flow, Engine и Android-фишки",
                "Делитесь текстами и файлами в IGseek через системное меню Android «Поделиться», используйте голосовой ввод, оффлайн-очередь и виджет на рабочем столе.",
                "Составь чек-лист продуктивного утра на 5 пунктов без лишней воды."
            )
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onOpenDrawer) {
                Icon(Icons.Rounded.Menu, contentDescription = "Menu", tint = palette.textPrimary)
            }
            IGseekFoxLogo(size = 20.dp)
            Spacer(Modifier.width(8.dp))
            Column {
                Text(
                    text = if (isEn) "Documentation" else "Документация",
                    style = MaterialTheme.typography.titleMedium,
                    color = palette.textPrimary
                )
                Text(
                    text = if (isEn) "Guides & 1-tap prompt templates" else "Руководство и быстрые шаблоны",
                    style = MaterialTheme.typography.labelSmall,
                    color = palette.textMuted
                )
            }
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(guides) { guide ->
                IGseekGlassCard(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(18.dp),
                    contentPadding = 15.dp
                ) {
                    Text(guide.title, style = MaterialTheme.typography.titleMedium, color = palette.textPrimary)
                    Spacer(Modifier.height(5.dp))
                    Text(guide.description, style = MaterialTheme.typography.bodySmall, color = palette.textSecondary)
                    Spacer(Modifier.height(10.dp))
                    Surface(
                        modifier = Modifier
                            .clip(RoundedCornerShape(11.dp))
                            .clickable { viewModel.startPromptInChat(guide.promptToTry) },
                        shape = RoundedCornerShape(11.dp),
                        color = palette.brandSoft,
                        border = BorderStroke(1.dp, palette.brandBorder)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 11.dp, vertical = 7.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(Icons.Rounded.PlayArrow, contentDescription = null, tint = palette.brand, modifier = Modifier.size(15.dp))
                            Text(
                                text = if (isEn) "Try in Chat" else "Попробовать в чате",
                                style = MaterialTheme.typography.labelMedium,
                                color = palette.textPrimary
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun WaveScreen(
    state: IGseekUiState,
    onOpenDrawer: () -> Unit,
    onBackToChat: () -> Unit
) {
    val palette = LocalIGseekPalette.current
    val isEn = state.layoutPrefs.language == "en"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onOpenDrawer) {
                Icon(Icons.Rounded.Menu, contentDescription = "Menu", tint = palette.textPrimary)
            }
            IGseekFoxLogo(size = 20.dp)
            Spacer(Modifier.width(8.dp))
            Text("IGseek Wave", style = MaterialTheme.typography.titleMedium, color = palette.textPrimary)
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            IGseekGlassCard(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                contentPadding = 24.dp
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    IGseekFoxLogo(size = 64.dp, showGlow = true)
                    Spacer(Modifier.height(12.dp))
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = palette.brandSoft,
                        border = BorderStroke(1.dp, palette.brandBorder)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp)
                        ) {
                            Icon(Icons.Rounded.Call, contentDescription = null, tint = palette.brand, modifier = Modifier.size(13.dp))
                            Text(
                                text = if (isEn) "COMING SOON" else "СКОРО",
                                style = MaterialTheme.typography.labelSmall,
                                color = palette.brand,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Text(
                        text = "IGseek Wave",
                        style = MaterialTheme.typography.headlineMedium,
                        color = palette.textPrimary
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = if (isEn) {
                            "Real-time full-duplex voice conversations with IGseek are on the way. Meanwhile, you can use instant voice dictation directly inside Chat!"
                        } else {
                            "Живой голосовой диалог в реальном времени скоро появится в IGseek Wave. А уже сейчас в чате работает мгновенный голосовой ввод с микрофона!"
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = palette.textMuted,
                        textAlign = TextAlign.Center
                    )
                    Spacer(Modifier.height(18.dp))
                    Button(
                        onClick = onBackToChat,
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = palette.brand,
                            contentColor = palette.brandOn
                        ),
                        modifier = Modifier.fillMaxWidth().height(46.dp)
                    ) {
                        Text(if (isEn) "Open Chat with Voice Input" else "Перейти в чат с голосовым вводом", fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}
