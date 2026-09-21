package com.dheemafy.music.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import com.dheemafy.music.data.local.SessionManager
import com.dheemafy.music.data.repository.MusicRepository
import com.dheemafy.music.playback.PlaybackManager
import com.dheemafy.music.ui.components.MiniPlayer
import com.dheemafy.music.ui.screens.*
import com.dheemafy.music.ui.theme.*

sealed class Screen(val route: String, val title: String, val icon: ImageVector) {
    object Home : Screen("home", "Home", Icons.Default.Home)
    object Search : Screen("search", "Search", Icons.Default.Search)
    object Playlists : Screen("playlists", "Playlists", Icons.Default.LibraryMusic)
}

@Composable
fun DheemafyApp(
    repository: MusicRepository,
    sessionManager: SessionManager,
    playbackManager: PlaybackManager,
    modifier: Modifier = Modifier
) {
    val navController = rememberNavController()
    val playbackState by playbackManager.playbackState.collectAsState()
    var isNowPlayingOpen by remember { mutableStateOf(false) }

    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val bottomNavItems = listOf(
        Screen.Home,
        Screen.Search,
        Screen.Playlists
    )

    // Handle back button when Now Playing is expanded
    BackHandler(enabled = isNowPlayingOpen) {
        isNowPlayingOpen = false
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(SpotifyBlack)
    ) {
        Scaffold(
            bottomBar = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(SpotifyDarkSurface)
                ) {
                    // Mini Player (Only visible if there is an active song)
                    if (playbackState.currentSong != null) {
                        MiniPlayer(
                            playbackState = playbackState,
                            onPlayPauseClick = { playbackManager.playPause() },
                            onMiniPlayerClick = { isNowPlayingOpen = true }
                        )
                    }

                    // Bottom Navigation Bar
                    NavigationBar(
                        containerColor = SpotifyDarkSurface,
                        contentColor = SpotifyWhite,
                        tonalElevation = 0.dp
                    ) {
                        bottomNavItems.forEach { screen ->
                            val isSelected = currentRoute == screen.route
                            NavigationBarItem(
                                icon = {
                                    Icon(
                                        imageVector = screen.icon,
                                        contentDescription = screen.title
                                    )
                                },
                                label = {
                                    Text(
                                        text = screen.title,
                                        fontSize = 11.sp
                                    )
                                },
                                selected = isSelected,
                                onClick = {
                                    navController.navigate(screen.route) {
                                        popUpTo(navController.graph.findStartDestination().id) {
                                            saveState = true
                                        }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = SpotifyWhite,
                                    selectedTextColor = SpotifyWhite,
                                    unselectedIconColor = SpotifyGrayText,
                                    unselectedTextColor = SpotifyGrayText,
                                    indicatorColor = SpotifyDarkSurface
                                )
                            )
                        }
                    }
                }
            }
        ) { paddingValues ->
            NavHost(
                navController = navController,
                startDestination = Screen.Home.route,
                modifier = Modifier.padding(paddingValues)
            ) {
                composable(Screen.Home.route) {
                    HomeScreen(
                        repository = repository,
                        sessionManager = sessionManager,
                        playbackManager = playbackManager,
                        playbackState = playbackState,
                        onPlaylistClick = { id, name ->
                            navController.navigate("playlist/$id/$name")
                        },
                        onArtistClick = { id, name ->
                            navController.navigate("artist/$id/$name")
                        }
                    )
                }

                composable(Screen.Search.route) {
                    SearchScreen(
                        repository = repository,
                        playbackManager = playbackManager,
                        playbackState = playbackState,
                        onArtistClick = { id, name ->
                            navController.navigate("artist/$id/$name")
                        }
                    )
                }

                composable(Screen.Playlists.route) {
                    // Playlists tab displays standard library playlists: Sharu, Hills, All Songs
                    PlaylistDetailScreen(
                        playlistId = "all-songs",
                        playlistName = "All Songs",
                        repository = repository,
                        playbackManager = playbackManager,
                        playbackState = playbackState,
                        onBackClick = { navController.popBackStack() }
                    )
                }

                composable(
                    route = "playlist/{playlistId}/{playlistName}",
                    arguments = listOf(
                        navArgument("playlistId") { type = NavType.StringType },
                        navArgument("playlistName") { type = NavType.StringType }
                    )
                ) { backStackEntry ->
                    val playlistId = backStackEntry.arguments?.getString("playlistId") ?: ""
                    val playlistName = backStackEntry.arguments?.getString("playlistName") ?: "Playlist"
                    PlaylistDetailScreen(
                        playlistId = playlistId,
                        playlistName = playlistName,
                        repository = repository,
                        playbackManager = playbackManager,
                        playbackState = playbackState,
                        onBackClick = { navController.popBackStack() }
                    )
                }

                composable(
                    route = "artist/{artistId}/{artistName}",
                    arguments = listOf(
                        navArgument("artistId") { type = NavType.StringType },
                        navArgument("artistName") { type = NavType.StringType }
                    )
                ) { backStackEntry ->
                    val artistId = backStackEntry.arguments?.getString("artistId") ?: ""
                    val artistName = backStackEntry.arguments?.getString("artistName") ?: "Artist"
                    ArtistDetailScreen(
                        artistId = artistId,
                        artistName = artistName,
                        repository = repository,
                        playbackManager = playbackManager,
                        playbackState = playbackState,
                        onBackClick = { navController.popBackStack() }
                    )
                }
            }
        }

        // Fullscreen Now Playing Overlay
        AnimatedVisibility(
            visible = isNowPlayingOpen,
            enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
            exit = slideOutVertically(targetOffsetY = { it }) + fadeOut()
        ) {
            NowPlayingScreen(
                playbackState = playbackState,
                playbackManager = playbackManager,
                repository = repository,
                onCollapse = { isNowPlayingOpen = false }
            )
        }
    }
}
