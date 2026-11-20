// SPDX-License-Identifier: MIT
// Whether Android's Location setting is on. Before Android 12 the Bluetooth stack drops every
// result of an app's scan while it is off (AOSP, packages/apps/Bluetooth, GattService's
// hasScanResultPermission, android11-release and pie-release, read 2026-11-21): set-up tells the
// person so, rather than that no device is near (ADR-0007).
package expo.modules.locationsetting

import android.content.Context
import android.location.LocationManager
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LocationSettingModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("LocationSetting")

    // The setting the stack reads: LocationManager's from Android 9, and before it the secure
    // setting LOCATION_MODE, which Android 9's stack itself still read.
    AsyncFunction("isLocationEnabled") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        context.getSystemService(LocationManager::class.java).isLocationEnabled
      } else {
        @Suppress("DEPRECATION")
        Settings.Secure.getInt(
          context.contentResolver,
          Settings.Secure.LOCATION_MODE,
          Settings.Secure.LOCATION_MODE_OFF,
        ) != Settings.Secure.LOCATION_MODE_OFF
      }
    }
  }
}
