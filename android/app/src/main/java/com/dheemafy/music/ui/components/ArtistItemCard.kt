package com.dheemafy.music.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
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
import coil.compose.SubcomposeAsyncImage
import com.dheemafy.music.data.model.Artist
import com.dheemafy.music.ui.theme.SpotifyGrayText
import com.dheemafy.music.ui.theme.SpotifyWhite

private val ArtistGradients = listOf(
    listOf(Color(0xFF3B82F6), Color(0xFF1E3A8A)), // Blue
    listOf(Color(0xFF8B5CF6), Color(0xFF581C87)), // Purple
    listOf(Color(0xFFEC4899), Color(0xFF831843)), // Pink
    listOf(Color(0xFF10B981), Color(0xFF064E3B)), // Emerald
    listOf(Color(0xFFF59E0B), Color(0xFF78350F)), // Amber
    listOf(Color(0xFF06B6D4), Color(0xFF164E63)), // Cyan
    listOf(Color(0xFFEF4444), Color(0xFF7F1D1D))  // Red
)

@Composable
fun ArtistItemCard(
    artist: Artist,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val imageUrl = artist.resolvedLargeImageUrl

    Column(
        modifier = modifier
            .width(110.dp)
            .clickable { onClick() }
            .padding(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(96.dp)
                .clip(CircleShape),
            contentAlignment = Alignment.Center
        ) {
            if (imageUrl.isNotBlank()) {
                SubcomposeAsyncImage(
                    model = imageUrl,
                    contentDescription = artist.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                    loading = {
                        ArtistFallbackAvatar(name = artist.name)
                    },
                    error = {
                        ArtistFallbackAvatar(name = artist.name)
                    }
                )
            } else {
                ArtistFallbackAvatar(name = artist.name)
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = artist.name,
            color = SpotifyWhite,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        val songCount = artist.songCount ?: 0
        if (songCount > 0) {
            Text(
                text = "$songCount songs",
                color = SpotifyGrayText,
                fontSize = 11.sp,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
fun ArtistFallbackAvatar(
    name: String,
    modifier: Modifier = Modifier
) {
    val gradient = remember(name) {
        val index = (name.hashCode() and 0x7FFFFFFF) % ArtistGradients.size
        ArtistGradients[index]
    }
    val initial = name.take(1).uppercase()

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Brush.linearGradient(gradient))
            .border(1.dp, Color.White.copy(alpha = 0.15f), CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = initial,
            color = Color.White,
            fontSize = 32.sp,
            fontWeight = FontWeight.Bold
        )
    }
}
