import 'package:flutter/material.dart';
import '../services/api_service.dart';

class CreateCampaignScreen extends StatefulWidget {
  const CreateCampaignScreen({super.key});

  @override
  State<CreateCampaignScreen> createState() => _CreateCampaignScreenState();
}

class _CreateCampaignScreenState extends State<CreateCampaignScreen> {
  final _titleController = TextEditingController();
  final _descController = TextEditingController();
  final _goalController = TextEditingController();
  final _api = ApiService();
  String? _error;
  bool _loading = false;

  Future<void> _submit() async {
    setState(() { _loading = true; _error = null; });
    try {
      final fundraiser = await _api.createCampaign({
        'title': _titleController.text,
        'description': _descController.text,
        'goal_amount': double.tryParse(_goalController.text) ?? 0,
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Fundraiser created: /f/${fundraiser.slug}')),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Start a fundraiser')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(controller: _titleController, decoration: const InputDecoration(labelText: 'Title')),
            TextField(controller: _descController, decoration: const InputDecoration(labelText: 'Description'), maxLines: 3),
            TextField(controller: _goalController, decoration: const InputDecoration(labelText: 'Goal amount'), keyboardType: TextInputType.number),
            if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loading ? null : _submit,
              child: Text(_loading ? 'Creating...' : 'Create fundraiser'),
            ),
          ],
        ),
      ),
    );
  }
}
