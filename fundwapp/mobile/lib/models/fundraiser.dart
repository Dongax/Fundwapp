class Fundraiser {
  final String id;
  final String title;
  final String description;
  final double goalAmount;
  final double amountRaised;
  final String currency;
  final String slug;
  final int contributorCount;

  Fundraiser({
    required this.id,
    required this.title,
    required this.description,
    required this.goalAmount,
    required this.amountRaised,
    required this.currency,
    required this.slug,
    required this.contributorCount,
  });

  double get progressPct =>
      goalAmount == 0 ? 0 : (amountRaised / goalAmount * 100).clamp(0, 100);

  factory Fundraiser.fromJson(Map<String, dynamic> json) {
    return Fundraiser(
      id: json['id'] ?? '',
      title: json['title'] ?? '',
      description: json['description'] ?? '',
      goalAmount: (json['goal_amount'] as num?)?.toDouble() ?? 0,
      amountRaised: (json['amount_raised'] as num?)?.toDouble() ?? 0,
      currency: json['currency'] ?? 'KES',
      slug: json['slug'] ?? '',
      contributorCount: json['contributor_count'] ?? 0,
    );
  }
}
