import { supabase } from '@/lib/supabase';
import type { Customer } from '@/lib/types';

export async function insertCustomer(
  customer: Omit<Customer, 'id' | 'created_at'>
): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .insert(customer)
    .select()
    .single();
  if (error) throw error;
  return data as Customer;
}

export async function updateCustomerDocumentUrl(
  customerId: string,
  documentUrl: string
): Promise<void> {
  const { error } = await supabase
    .from('customers')
    .update({ id_proof_document_url: documentUrl })
    .eq('id', customerId);
  if (error) throw error;
}

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return data as Customer[];
}
