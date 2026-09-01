import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class AppColors {
  static const ink = Color(0xFF162033);
  static const muted = Color(0xFF657084);
  static const orange = Color(0xFFF28A1A);
  static const orangeSoft = Color(0xFFFFEBD2);
  static const green = Color(0xFF187B5A);
  static const red = Color(0xFFC94945);
  static const blue = Color(0xFF2C6D96);
  static const teal = Color(0xFF287E78);
  static const surface = Color(0xFFF1F4F7);
  static const line = Color(0xFFC9D2DC);
  static const glass = Color(0xBFFFFFFF);
  static const glassStrong = Color(0xE8FFFFFF);
  static const glassBorder = Color(0xD9FFFFFF);
  static const mistBlue = Color(0xFFDCE9F2);
  static const mistOrange = Color(0xFFF6E5D2);
  static const mistTeal = Color(0xFFD9EAE7);
}

class AppTheme {
  static ThemeData get light {
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.orange,
      primary: AppColors.orange,
      secondary: AppColors.blue,
      tertiary: AppColors.teal,
      surface: AppColors.glassStrong,
      error: AppColors.red,
      brightness: Brightness.light,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: Colors.transparent,
      canvasColor: const Color(0xFFF8FAFC),
      fontFamily: 'SF Pro Display',
      splashFactory: InkSparkle.splashFactory,
      visualDensity: VisualDensity.standard,
      textTheme: const TextTheme(
        headlineLarge: TextStyle(
          fontSize: 30,
          fontWeight: FontWeight.w800,
          color: AppColors.ink,
          height: 1.08,
        ),
        headlineSmall: TextStyle(
          fontSize: 23,
          fontWeight: FontWeight.w800,
          color: AppColors.ink,
          height: 1.12,
        ),
        titleLarge: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: AppColors.ink,
        ),
        titleMedium: TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w700,
          color: AppColors.ink,
        ),
        bodyLarge: TextStyle(fontSize: 16, color: AppColors.ink, height: 1.4),
        bodyMedium: TextStyle(
          fontSize: 14,
          color: AppColors.muted,
          height: 1.4,
        ),
      ),
      cardTheme: const CardThemeData(
        color: AppColors.glass,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(8)),
          side: BorderSide(color: AppColors.glassBorder),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.glassStrong,
        labelStyle: const TextStyle(color: AppColors.muted),
        hintStyle: TextStyle(color: AppColors.muted.withValues(alpha: .72)),
        prefixIconColor: AppColors.muted,
        suffixIconColor: AppColors.muted,
        border: const OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(10)),
          borderSide: BorderSide(color: AppColors.glassBorder),
        ),
        enabledBorder: const OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(10)),
          borderSide: BorderSide(color: AppColors.glassBorder),
        ),
        focusedBorder: const OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(10)),
          borderSide: BorderSide(color: AppColors.orange, width: 1.6),
        ),
        errorBorder: const OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(10)),
          borderSide: BorderSide(color: AppColors.red),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 15,
          vertical: 15,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(48, 50),
          elevation: 0,
          shadowColor: AppColors.orange.withValues(alpha: .28),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(48, 48),
          foregroundColor: AppColors.ink,
          backgroundColor: Colors.white.withValues(alpha: .5),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          side: const BorderSide(color: AppColors.glassBorder),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.blue,
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xB8FFFFFF),
        surfaceTintColor: Colors.transparent,
        foregroundColor: AppColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        systemOverlayStyle: SystemUiOverlayStyle.dark,
        titleTextStyle: TextStyle(
          color: AppColors.ink,
          fontSize: 17,
          fontWeight: FontWeight.w700,
        ),
      ),
      navigationBarTheme: const NavigationBarThemeData(
        backgroundColor: Colors.transparent,
        indicatorColor: AppColors.orangeSoft,
        indicatorShape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(10)),
        ),
        height: 68,
        labelTextStyle: WidgetStatePropertyAll(
          TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: Colors.white.withValues(alpha: .82),
        selectedColor: AppColors.orangeSoft,
        side: const BorderSide(color: AppColors.glassBorder),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(9)),
        checkmarkColor: AppColors.ink,
        labelStyle: const TextStyle(
          color: AppColors.ink,
          fontWeight: FontWeight.w700,
        ),
        secondaryLabelStyle: const TextStyle(
          color: AppColors.ink,
          fontWeight: FontWeight.w700,
        ),
      ),
      dialogTheme: const DialogThemeData(
        backgroundColor: AppColors.glassStrong,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(16)),
          side: BorderSide(color: AppColors.glassBorder),
        ),
      ),
      dividerColor: AppColors.line.withValues(alpha: .68),
    );
  }
}

class AppBackdrop extends StatelessWidget {
  const AppBackdrop({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: AppColors.surface,
      child: Stack(
        children: [
          Positioned(
            top: -120,
            left: -60,
            right: -60,
            height: 360,
            child: ImageFiltered(
              imageFilter: ImageFilter.blur(sigmaX: 48, sigmaY: 72),
              child: const ColoredBox(color: AppColors.mistBlue),
            ),
          ),
          Positioned(
            top: 360,
            left: -50,
            right: -50,
            height: 270,
            child: ImageFiltered(
              imageFilter: ImageFilter.blur(sigmaX: 42, sigmaY: 68),
              child: const ColoredBox(color: AppColors.mistOrange),
            ),
          ),
          Positioned(
            top: 760,
            left: -40,
            right: -40,
            height: 310,
            child: ImageFiltered(
              imageFilter: ImageFilter.blur(sigmaX: 46, sigmaY: 70),
              child: const ColoredBox(color: AppColors.mistTeal),
            ),
          ),
          Positioned.fill(child: child),
        ],
      ),
    );
  }
}
