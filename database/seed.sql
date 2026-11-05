-- Repeatable fictional test data; no real credentials.
USE replate;

INSERT INTO organizations (organization_name, organization_type, address)
SELECT 'Replate Demo Restaurant', 'FOODSERVICE', '123 Main Street'
WHERE NOT EXISTS (
 SELECT 1 FROM organizations WHERE organization_name='Replate Demo Restaurant'
 AND organization_type='FOODSERVICE'
);

INSERT INTO organizations (organization_name, organization_type, address)
SELECT 'Replate Demo Food Bank', 'RECIPIENT', '456 Main Street'
WHERE NOT EXISTS (
 SELECT 1 FROM organizations WHERE organization_name='Replate Demo Food Bank'
 AND organization_type='RECIPIENT'
);

SET @donor_org_id = (SELECT MIN(organization_id) FROM organizations
 WHERE organization_name='Replate Demo Restaurant' AND organization_type='FOODSERVICE');
SET @recipient_org_id = (SELECT MIN(organization_id) FROM organizations
 WHERE organization_name='Replate Demo Food Bank' AND organization_type='RECIPIENT');

-- Placeholders are deliberately NOT valid password hashes; login is not implemented.
INSERT INTO users (organization_id, email, password_hash, role)
SELECT @donor_org_id, 'donor-demo@replate.example', 'DEMO_NOT_FOR_LOGIN', 'FOOD_DONOR'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='donor-demo@replate.example');

INSERT INTO users (organization_id, email, password_hash, role)
SELECT @recipient_org_id, 'recipient-demo@replate.example', 'DEMO_NOT_FOR_LOGIN', 'RECIPIENT'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='recipient-demo@replate.example');

SELECT o.organization_id, o.organization_name, o.organization_type
FROM organizations o WHERE o.organization_name IN
 ('Replate Demo Restaurant','Replate Demo Food Bank');
SELECT user_id, email, role, organization_id FROM users
WHERE email IN ('donor-demo@replate.example','recipient-demo@replate.example');
