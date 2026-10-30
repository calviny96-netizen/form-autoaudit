-- Roles keep their existing reach: whoever could manage calendars or bookings gets the matching form permission.
UPDATE roles r SET permissions = r.permissions || ARRAY(
  SELECT m.added FROM (VALUES
    ('campaigns.read','forms.read'),('campaigns.create','forms.create'),('campaigns.update','forms.update'),('campaigns.publish','forms.publish'),('campaigns.archive','forms.archive'),
    ('bookings.read','responses.read'),('bookings.export','responses.export'),('bookings.cancel','responses.delete')
  ) AS m(held,added)
  WHERE m.held = ANY(r.permissions) AND NOT m.added = ANY(r.permissions)
);
