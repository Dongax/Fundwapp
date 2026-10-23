import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../models/fundraiser.dart';

// Implements SDD 4.1: open fundraiser link -> select payment & enter details ->
// system initiates payment request -> contributor approves on device.
class ContributeScreen extends StatefulWidget {
  final String slug;
  const ContributeScreen({super.key, required this.slug});

  @override
  State<ContributeScreen> createState() => _ContributeScreenState();
}

class _ContributeScreenState extends State<ContributeScreen> {
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _amountController = TextEditingController();
  String _paymentMethod = 'mpesa';
  final _api = ApiService();

  Fundraiser? _fundraiser;
  String? _statusMessage;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _api.getPublicFundraiser(widget.slug).then((f) => setState(() => _fundraiser = f)).catchError((_) {});
  }

  Future<void> _submit() async {
    setState(() { _loading = true; _statusMessage = null; });
    try {
      final msg = await _api.contribute(
        slug: widget.slug,
        name: _nameController.text,
        phone: _phoneController.text,
        amount: double.tryParse(_amountController.text) ?? 0,
        paymentMethod: _paymentMethod,
      );
      setState(() => _statusMessage = msg);
    } catch (e) {
      setState(() => _statusMessage = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_fundraiser?.title ?? 'Fundraiser')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            if (_fundraiser != null) ...[
              LinearProgressIndicator(value: _fundraiser!.progressPct / 100),
              Text('${_fundraiser!.amountRaised} / ${_fundraiser!.goalAmount} ${_fundraiser!.currency}'),
              const SizedBox(height: 16),
            ],
            TextField(controller: _nameController, decoration: const InputDecoration(labelText: 'Your name')),
            TextField(controller: _phoneController, decoration: const InputDecoration(labelText: 'Phone number')),
            TextField(controller: _amountController, decoration: const InputDecoration(labelText: 'Amount'), keyboardType: TextInputType.number),
            DropdownButton<String>(
              value: _paymentMethod,
              items: const [
                DropdownMenuItem(value: 'mpesa', child: Text('M-Pesa')),
                DropdownMenuItem(value: 'airtel_money', child: Text('Airtel Money')),
                DropdownMenuItem(value: 'card', child: Text('Card')),
                DropdownMenuItem(value: 'bank_transfer', child: Text('Bank Transfer')),
              ],
              onChanged: (v) => setState(() => _paymentMethod = v!),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loading ? null : _submit,
              child: Text(_loading ? 'Sending request...' : 'Contribute'),
            ),
            if (_statusMessage != null) Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Text(_statusMessage!),
            ),
          ],
        ),
      ),
    );
  }
}
