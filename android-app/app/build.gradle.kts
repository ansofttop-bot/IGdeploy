import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val firebaseConfigFile = rootProject.file("../firebase-applet-config.json")
val firebaseJson: Map<String, Any> = if (firebaseConfigFile.exists()) {
    @Suppress("UNCHECKED_CAST")
    JsonSlurper().parse(firebaseConfigFile) as Map<String, Any>
} else {
    emptyMap()
}

val firebaseWebApiKey = (providers.gradleProperty("IGSEEK_FIREBASE_API_KEY").orNull
    ?: firebaseJson["apiKey"]?.toString()
    ?: "").replace("\"", "")
val firebaseProjectId = (providers.gradleProperty("IGSEEK_FIREBASE_PROJECT_ID").orNull
    ?: firebaseJson["projectId"]?.toString()
    ?: "").replace("\"", "")
val defaultApiBaseUrl = (providers.gradleProperty("IGSEEK_API_BASE_URL").orNull
    ?: "https://igeek-chat.lovable.app").replace("\"", "")

android {
    namespace = "app.igseek.mobile"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.igseek.mobile"
        minSdk = 26
        targetSdk = 35
        versionCode = 200
        versionName = "2.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }

        buildConfigField("String", "DEFAULT_API_BASE_URL", "\"$defaultApiBaseUrl\"")
        buildConfigField("String", "FIREBASE_WEB_API_KEY", "\"$firebaseWebApiKey\"")
        buildConfigField("String", "FIREBASE_PROJECT_ID", "\"$firebaseProjectId\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.fragment:fragment-ktx:1.8.5")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.animation:animation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("androidx.browser:browser:1.8.0")

    testImplementation("junit:junit:4.13.2")
}
