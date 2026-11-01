-- Fundwapp supports M-Pesa only. Existing databases keep their historical rows, but nothing else can be used.
UPDATE payment_methods SET is_active = 0 WHERE code <> 'mpesa';
UPDATE payout_methods  SET is_active = 0 WHERE code <> 'mpesa';
