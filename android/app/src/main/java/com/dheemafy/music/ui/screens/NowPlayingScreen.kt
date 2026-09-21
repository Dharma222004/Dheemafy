package com.dheemafy.music.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.Player
import coil.compose.AsyncImage
import com.dheemafy.music.data.model.Album
import com.dheemafy.music.data.model.Artist
import com.dheemafy.music.data.model.Song
import com.dheemafy.music.data.repository.MusicRepository
import com.dheemafy.music.playback.PlaybackManager
import com.dheemafy.music.playback.PlaybackState
import com.dheemafy.music.ui.components.SongCoverImage
import com.dheemafy.music.ui.theme.*
import kotlinx.coroutines.launch
import java.util.Locale

@Composable
fun NowPlayingScreen(
    playbackState: PlaybackState,
    playbackManager: PlaybackManager,
    repository: MusicRepository,
    onCollapse: () -> Unit,
    modifier: Modifier = Modifier
) {
    val song = playbackState.currentSong ?: return
    val scope = rememberCoroutineScope()

    var isDraggingSlider by remember { mutableStateOf(false) }
    var draggedPositionMs by remember { mutableLongStateOf(0L) }

    val displayPositionMs = if (isDraggingSlider) draggedPositionMs else playbackState.currentPositionMs
    val durationMs = playbackState.durationMs.coerceAtLeast(1L)

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        Color(0xFF38234D),
                        Color(0xFF1E1724),
                        SpotifyBlack
                    )
                )
            )
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = 24.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Top Bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onCollapse) {
                    Icon(
                        imageVector = Icons.Default.KeyboardArrowDown,
                        contentDescription = "Collapse",
                        tint = SpotifyWhite,
                        modifier = Modifier.size(32.dp)
                    )
                }

                Column(
                    modifier = Modifier.weight(1f),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "PLAYING FROM PLAYLIST",
                        color = SpotifyGrayText,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 1.sp
                    )
                    Text(
                        text = playbackState.queueTitle,
                        color = SpotifyWhite,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                IconButton(onClick = { /* Menu options */ }) {
                    Icon(
                        imageVector = Icons.Default.MoreVert,
                        contentDescription = "Options",
                        tint = SpotifyWhite
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Large Album Artwork (Primary Visual - NO LYRICS)
            SongCoverImage(
                rawUrl = song.resolvedCoverImageUrl,
                title = song.title,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f),
                shape = RoundedCornerShape(12.dp)
            )

            Spacer(modifier = Modifier.height(28.dp))

            // Song Title & Artist + Like Button
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(
                    modifier = Modifier.weight(1f)
                ) {
                    Text(
                        text = song.title,
                        color = SpotifyWhite,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = song.displaySubtext,
                        color = SpotifyGrayText,
                        fontSize = 15.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                IconButton(
                    onClick = {
                        scope.launch {
                            repository.toggleLike(song.id, song.isLiked)
                        }
                    }
                ) {
                    Icon(
                        imageVector = if (song.isLiked) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                        contentDescription = if (song.isLiked) "Unlike" else "Like",
                        tint = if (song.isLiked) SpotifyGreen else SpotifyWhite,
                        modifier = Modifier.size(28.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Scrubber / Seek Bar
            Slider(
                value = (displayPositionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f),
                onValueChange = { fraction ->
                    isDraggingSlider = true
                    draggedPositionMs = (fraction * durationMs).toLong()
                },
                onValueChangeFinished = {
                    playbackManager.seekTo(draggedPositionMs)
                    isDraggingSlider = false
                },
                colors = SliderDefaults.colors(
                    thumbColor = SpotifyWhite,
                    activeTrackColor = SpotifyWhite,
                    inactiveTrackColor = SpotifyDivider
                ),
                modifier = Modifier.fillMaxWidth()
            )

            // Timestamps: Elapsed & Remaining
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = formatMs(displayPositionMs),
                    color = SpotifyGrayText,
                    fontSize = 12.sp
                )
                Text(
                    text = formatMs(durationMs),
                    color = SpotifyGrayText,
                    fontSize = 12.sp
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Main Playback Controls
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Shuffle Toggle
                IconButton(onClick = { playbackManager.toggleShuffle() }) {
                    Icon(
                        imageVector = Icons.Default.Shuffle,
                        contentDescription = "Shuffle",
                        tint = if (playbackState.isShuffleEnabled) SpotifyGreen else SpotifyGrayText,
                        modifier = Modifier.size(26.dp)
                    )
                }

                // Previous (3-second restart rule)
                IconButton(
                    onClick = { playbackManager.skipToPrevious() },
                    modifier = Modifier.size(48.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.SkipPrevious,
                        contentDescription = "Previous",
                        tint = SpotifyWhite,
                        modifier = Modifier.size(36.dp)
                    )
                }

                // Play / Pause Circle
                Box(
                    modifier = Modifier
                        .size(68.dp)
                        .clip(CircleShape)
                        .background(SpotifyWhite),
                    contentAlignment = Alignment.Center
                ) {
                    if (playbackState.isBuffering) {
                        CircularProgressIndicator(
                            color = SpotifyBlack,
                            strokeWidth = 3.dp,
                            modifier = Modifier.size(32.dp)
                        )
                    } else {
                        IconButton(
                            onClick = { playbackManager.playPause() },
                            modifier = Modifier.fillMaxSize()
                        ) {
                            Icon(
                                imageVector = if (playbackState.isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                                contentDescription = if (playbackState.isPlaying) "Pause" else "Play",
                                tint = SpotifyBlack,
                                modifier = Modifier.size(38.dp)
                            )
                        }
                    }
                }

                // Next
                IconButton(
                    onClick = { playbackManager.skipToNext() },
                    modifier = Modifier.size(48.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.SkipNext,
                        contentDescription = "Next",
                        tint = SpotifyWhite,
                        modifier = Modifier.size(36.dp)
                    )
                }

                // Repeat Mode Toggle (Off -> All -> One -> Off)
                IconButton(onClick = { playbackManager.toggleRepeat() }) {
                    val (repeatIcon, repeatTint) = when (playbackState.repeatMode) {
                        Player.REPEAT_MODE_ONE -> Icons.Default.RepeatOne to SpotifyGreen
                        Player.REPEAT_MODE_ALL -> Icons.Default.Repeat to SpotifyGreen
                        else -> Icons.Default.Repeat to SpotifyGrayText
                    }
                    Icon(
                        imageVector = repeatIcon,
                        contentDescription = "Repeat Mode",
                        tint = repeatTint,
                        modifier = Modifier.size(26.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.weight(1f))
        }
    }
}

private fun formatMs(ms: Long): String {
    val totalSeconds = (ms / 1000).coerceAtLeast(0)
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return String.format(Locale.getDefault(), "%02d:%02d", minutes, seconds)
}
