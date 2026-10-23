import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/fundraiser.dart';

// Point this at your backend's base URL (the same Express API used by the web app).
class ApiService {
  static const String baseUrl = 'http://10.0.2.2:5000/api'; // 10.0.2.2 = Android emulator localhost

  Future<Map<String, String>> _headers() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('fundwapp_token');
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<String> login(String phoneNumber, String password) async {
    final res = await http.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'phone_number': phoneNumber, 'password': password}),
    );
    if (res.statusCode != 200) {
      throw Exception(jsonDecode(res.body)['message'] ?? 'Login failed');
    }
    final data = jsonDecode(res.body);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('fundwapp_token', data['token']);
    return data['token'];
  }

  Future<void> register(String fullName, String phone, String email, String password) async {
    final res = await http.post(
      Uri.parse('$baseUrl/auth/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'full_name': fullName, 'phone_number': phone, 'email': email, 'password': password,
      }),
    );
    if (res.statusCode != 201) {
      throw Exception(jsonDecode(res.body)['message'] ?? 'Registration failed');
    }
  }

  Future<Fundraiser> createCampaign(Map<String, dynamic> payload) async {
    final res = await http.post(
      Uri.parse('$baseUrl/campaigns'),
      headers: await _headers(),
      body: jsonEncode(payload),
    );
    if (res.statusCode != 201) {
      throw Exception(jsonDecode(res.body)['message'] ?? 'Could not create fundraiser');
    }
    return Fundraiser.fromJson(jsonDecode(res.body));
  }

  Future<List<Fundraiser>> myCampaigns() async {
    final res = await http.get(Uri.parse('$baseUrl/campaigns/mine'), headers: await _headers());
    final List data = jsonDecode(res.body);
    return data.map((j) => Fundraiser.fromJson(j)).toList();
  }

  Future<Fundraiser> getPublicFundraiser(String slug) async {
    final res = await http.get(Uri.parse('$baseUrl/campaigns/public/$slug'));
    if (res.statusCode != 200) {
      throw Exception('Fundraiser not found');
    }
    return Fundraiser.fromJson(jsonDecode(res.body));
  }

  // Step: "Select payment & enter details" -> "System initiates payment request" (SDD 4.1)
  Future<String> contribute({
    required String slug,
    required String name,
    required String phone,
    required double amount,
    required String paymentMethod,
  }) async {
    final res = await http.post(
      Uri.parse('$baseUrl/payments/$slug/contribute'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'contributor_name': name,
        'contributor_phone': phone,
        'amount': amount,
        'payment_method': paymentMethod,
      }),
    );
    final data = jsonDecode(res.body);
    if (res.statusCode != 202) {
      throw Exception(data['message'] ?? 'Contribution failed');
    }
    return data['message']; // "Approve the prompt on your phone..."
  }
}
