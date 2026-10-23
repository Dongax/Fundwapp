import 'package:flutter/material.dart';
import 'screens/home_screen.dart';

void main() {
  runApp(const FundwappApp());
}

class FundwappApp extends StatelessWidget {
  const FundwappApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Fundwapp',
      theme: ThemeData(
        primarySwatch: Colors.green,
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}
