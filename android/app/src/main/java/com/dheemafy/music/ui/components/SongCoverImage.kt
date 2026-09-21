package com.dheemafy.music.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.SubcomposeAsyncImage
import com.dheemafy.music.ui.theme.SpotifyGreen

// Curated Spotify-inspired duotone palettes for tracks without album covers
private val FallbackGradients = listOf(
    listOf(Color(0xFF2E1065), Color(0xFF7C3AED)), // Deep Indigo to Purple
    listOf(Color(0xFF064E3B), Color(0xFF0D9488)), // Emerald to Teal
    listOf(Color(0xFF0C4A6E), Color(0xFF0284C7)), // Midnight Blue to Sky
    listOf(Color(0xFF881337), Color(0xFFE11D48)), // Deep Crimson to Rose
    listOf(Color(0xFF78350F), Color(0xFFD97706)), // Amber to Orange
    listOf(Color(0xFF4C1D95), Color(0xFFC026D3)), // Royal Violet to Fuchsia
    listOf(Color(0xFF14532D), Color(0xFF65A30D)), // Forest Green to Lime
    listOf(Color(0xFF1E293B), Color(0xFF475569))  // Slate to Cool Gray
)

@Composable
fun SongCoverImage(
    rawUrl: String?,
    title: String,
    modifier: Modifier = Modifier,
    size: Dp? = null,
    shape: Shape = RoundedCornerShape(6.dp),
    baseUrl: String = "https://dheemafy.vercel.app/"
) {
    // Resolve relative paths (/images/...) to full absolute URLs
    val resolvedUrl = remember(rawUrl, baseUrl) {
        val trimmed = rawUrl?.trim().orEmpty()
        if (trimmed.isBlank()) {
            ""
        } else if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            trimmed
        } else {
            val cleanBase = baseUrl.trimEnd('/')
            val cleanPath = trimmed.trimStart('/')
            "$cleanBase/$cleanPath"
        }
    }

    val gradientColors = remember(title) {
        val hash = title.hashCode()
        val index = (hash and 0x7FFFFFFF) % FallbackGradients.size
        FallbackGradients[index]
    }

    val boxModifier = if (size != null) {
        modifier.size(size).clip(shape)
    } else {
        modifier.clip(shape)
    }

    if (resolvedUrl.isNotBlank()) {
        SubcomposeAsyncImage(
            model = resolvedUrl,
            contentDescription = title,
            contentScale = ContentScale.Crop,
            modifier = boxModifier,
            loading = {
                ProceduralVinylCover(gradientColors = gradientColors)
            },
            error = {
                ProceduralVinylCover(gradientColors = gradientColors)
            }
        )
    } else {
        Box(modifier = boxModifier) {
            ProceduralVinylCover(gradientColors = gradientColors)
        }
    }
}

@Composable
fun ProceduralVinylCover(
    gradientColors: List<Color>,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Brush.linearGradient(gradientColors)),
        contentAlignment = Alignment.Center
    ) {
        // Outer vinyl disc ring
        Box(
            modifier = Modifier
                .fillMaxSize(0.85f)
                .clip(CircleShape)
                .border(1.dp, Color.White.copy(alpha = 0.12f), CircleShape)
                .background(Color.Black.copy(alpha = 0.25f)),
            contentAlignment = Alignment.Center
        ) {
            // Inner vinyl groove
            Box(
                modifier = Modifier
                    .fillMaxSize(0.65f)
                    .clip(CircleShape)
                    .border(1.dp, Color.White.copy(alpha = 0.08f), CircleShape)
                    .background(Color.Black.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center
            ) {
                // Center hub
                Box(
                    modifier = Modifier
                        .fillMaxSize(0.45f)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.6f))
                        .border(1.dp, SpotifyGreen.copy(alpha = 0.4f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.MusicNote,
                        contentDescription = null,
                        tint = Color.White.copy(alpha = 0.85f),
                        modifier = Modifier.fillMaxSize(0.55f)
                    )
                }
            }
        }
    }
}
