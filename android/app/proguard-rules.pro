# Dheemafy Proguard Rules
-keepattributes *Annotation*
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
-keep class com.dheemafy.music.data.model.** { *; }
-dontwarn okhttp3.**
-dontwarn retrofit2.**
-dontwarn androidx.media3.**
