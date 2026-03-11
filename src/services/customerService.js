import { supabase } from "../supabase";
import { generateUUID } from '../utils/uuid';


const TABLE_NAME = 'customers';

/**
 * Creates a new customer profile.
 */
export const createCustomer = async (customerData) => {
    // Generate a unique ID since Firebase used to do this automatically.
    const newId = generateUUID();

    const { data, error } = await supabase
        .from(TABLE_NAME)
        .insert([{
            id: newId,
            ...customerData
        }])
        .select()
        .single();

    if (error) {
        console.error("Error creating customer:", error);
        throw error;
    }
    return data;
};

/**
 * Updates an existing customer profile.
 */
export const updateCustomer = async (customerId, customerData) => {
    const { data, error } = await supabase
        .from(TABLE_NAME)
        .update(customerData)
        .eq('id', customerId)
        .select()
        .single();

    if (error) {
        console.error("Error updating customer:", error);
        throw error;
    }
    return data;
};

/**
 * Marks a customer as deleted (soft delete).
 * Note: Our Supabase schema doesn't currently contain an 'is_deleted' flag for customers,
 * so we will physically delete them or we need to add that column if soft-deletes are strictly required.
 * Assuming strict physical delete for now to match relational integrity unless specified.
 */
export const deleteCustomer = async (customerId) => {
    const { error } = await supabase
        .from(TABLE_NAME)
        .delete()
        .eq('id', customerId);

    if (error) {
        console.error("Error deleting customer:", error);
        throw error;
    }
};
