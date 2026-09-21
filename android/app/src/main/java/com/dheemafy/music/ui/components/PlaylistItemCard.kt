package com.dheemafy.music.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import com.dheemafy.music.data.model.Playlist
import com.dheemafy.music.ui.theme.*

@Composable
fun PlaylistItemCard(
    playlist: Playlist,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    baseUrl: String = "https://dheemafy.vercel.app/"
) {
    val fullImageUrl = remember(playlist.uploadedImage, baseUrl) {
        val raw = playlist.uploadedImage?.trim().orEmpty()
        if (raw.isBlank()) {
            ""
        } else if (raw.startsWith("http://") || raw.startsWith("https://")) {
            raw
        } else {
            val cleanBase = baseUrl.trimEnd('/')
            val cleanPath = raw.trimStart('/')
            "$cleanBase/$cleanPath"
        }
    }

    Column(
        modifier = modifier
            .width(140.dp)
            .clickable { onClick() }
            .padding(8.dp)
    ) {
        Box(
            modifier = Modifier
                .size(124.dp)
                .clip(RoundedCornerShape(8.dp))
        ) {
            if (fullImageUrl.isNotBlank()) {
                SubcomposeAsyncImage(
                    model = fullImageUrl,
                    contentDescription = playlist.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                    loading = {
                        PlaylistFallbackCard(name = playlist.name)
                    },
                    error = {
                        PlaylistFallbackCard(name = playlist.name)
                    }
                )
            } else {
                PlaylistFallbackCard(name = playlist.name)
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = playlist.name,
            color = SpotifyWhite,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        Spacer(modifier = Modifier.height(2.dp))

        val count = playlist.songCount ?: 0
        Text(
            text = "$count ${if (count == 1) "track" else "tracks"}",
            color = SpotifyGrayText,
            fontSize = 12.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
fun PlaylistFallbackCard(
    name: String,
    modifier: Modifier = Modifier
) {
    val (gradientColors, icon, subtitle) = remember(name) {
        when {
            name.contains("all", ignoreCase = true) -> Triple(
                listOf(Color(0xFF1E3A8A), Color(0xFF0F172A)),
                Icons.Default.QueueMusic,
                "ALL SONGS"
            )
            name.contains("sharu", ignoreCase = true) -> Triple(
                listOf(Color(0xFF7E22CE), Color(0xFF3B0764)),
                Icons.Default.Favorite,
                "SHARU"
            )
            name.contains("hills", ignoreCase = true) -> Triple(
                listOf(Color(0xFF047857), Color(0xFF064E3B)),
                Icons.Default.Landscape,
                "HILLS"
            )
            else -> Triple(
                listOf(Color(0xFF334155), Color(0xFF0F172A)),
                Icons.Default.MusicNote,
                "PLAYLIST"
            )
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(gradientColors))
            .padding(10.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = SpotifyWhite.copy(alpha = 0.9f),
                modifier = Modifier.size(36.dp)
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = subtitle,
                color = SpotifyGreenBright,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = name,
                color = SpotifyWhite,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
