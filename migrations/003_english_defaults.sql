-- Translate only the application's old defaults; preserve custom company content.
CREATE FUNCTION pg_temp.english_confirmation(config jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_object_agg(key, CASE
    WHEN key='title' AND value='"Selamat, pendaftaran Anda berhasil!"'::jsonb THEN to_jsonb('Your booking is confirmed!'::text)
    WHEN key='message' AND value='"Silakan hubungi panitia untuk langkah berikutnya."'::jsonb THEN to_jsonb('Contact the organizer for the next steps.'::text)
    WHEN key='label' AND value='"Hubungi Panitia via WhatsApp"'::jsonb THEN to_jsonb('Contact organizer on WhatsApp'::text)
    WHEN key='template' AND value='"Halo Panitia, saya {nama}. Saya mendaftar {gelombang} pada {tanggal}, {jam} {zona_waktu}. Kode booking {kode_booking}."'::jsonb THEN to_jsonb('Hello, I''m {name}. I booked {calendar} on {date} at {time} {timezone}. My booking code is {booking_code}.'::text)
    ELSE value END), '{}'::jsonb) FROM jsonb_each(config);
$$;
UPDATE companies SET success=pg_temp.english_confirmation(success);
UPDATE campaigns SET success=pg_temp.english_confirmation(success) WHERE success IS NOT NULL;
UPDATE roles r SET name='Booking Manager' WHERE name='Recruiter' AND NOT EXISTS(SELECT 1 FROM roles other WHERE other.company_id=r.company_id AND other.name='Booking Manager');
UPDATE platform_settings SET settings=jsonb_set(settings,'{email_note}',to_jsonb('Invitations are shared manually. Email delivery is not configured.'::text)) WHERE settings->>'email_note'='Undangan dibagikan manual; pengiriman email belum dikonfigurasi.';
