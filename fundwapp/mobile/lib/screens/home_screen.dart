import 'package:flutter/material.dart';
import 'login_screen.dart';
import 'create_campaign_screen.dart';
import 'contribute_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Fundwapp')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Raise funds for what matters', style: TextStyle(fontSize: 18)),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LoginScreen())),
              child: const Text('Log in as organizer'),
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const CreateCampaignScreen())),
              child: const Text('Start a fundraiser'),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ContributeScreen(slug: 'demo-fundraiser')),
              ),
              child: const Text('Open a fundraiser link (demo)'),
            ),
          ],
        ),
      ),
    );
  }
}
