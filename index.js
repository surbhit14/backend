const express = require('express');
const Razorpay = require('razorpay');
const mongoose = require('mongoose');
const cron = require('node-cron');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB');
});

// Razorpay instance
const razorpay = new Razorpay({
    key_id: 'YOUR_RAZORPAY_KEY_ID',
    key_secret: 'YOUR_RAZORPAY_KEY_SECRET',
});

// Order schema
const orderSchema = new mongoose.Schema({
    orderId: Number,
    fiatAmountAsked: Number, // Storing fiatAmountAsked in the database schema
    tokenProviderEmail: String,
    tokenProviderBankDetails: Object,
    fiatProviderEmail: String,
    fiatProviderWalletAddress: String,
});
const Order = mongoose.model('Order', orderSchema);

// Endpoint to create an order and store tokenProvider's bank details
app.post('/createOrder', async (req, res) => {
    const { tokenProviderEmail, tokenProviderBankDetails,fiatAmountAsked } = req.body;
    try {
        // Save tokenProvider's bank details in the order schema
        
        const currentOrderCount = await getCurrentOrderCountFromContract(); // Replace this with actual function to get order count from contract

        // Generate orderId based on current order count
        const orderId = currentOrderCount + 1; // You can adjust this based on your requirements

        // Save tokenProvider's details in the order schema
        const order = new Order({
            orderId,
            fiatAmountAsked,
            tokenProviderEmail,
            tokenProviderBankDetails
        });
        await order.save();
        res.status(201).send('Order created successfully');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error creating order');
    }
});

// Endpoint to add fiat provider details to an existing order
app.post('/addFiatProviderDetails/:orderId', async (req, res) => {
    const { fiatProviderEmail, fiatProviderWalletAddress } = req.body;
    const { orderId } = req.params;
    try {
        // Find the order by orderId and update fiat provider details
        const order = await Order.findOneAndUpdate({ orderId }, { fiatProviderEmail, fiatProviderWalletAddress }, { new: true });
        if (!order) {
            return res.status(404).send('Order not found');
        }
        res.status(200).send('Fiat provider details added successfully');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error adding fiat provider details');
    }
});

// Endpoint to get all orders from the smart contract
app.get('/getAllOrders', async (req, res) => {
    try {
        // Call the smart contract function to fetch all orders
        // Replace the below code with your actual contract interaction code
        const allOrders = await contractInstance.methods.getAllOrders().call();

        res.status(200).json(allOrders);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching orders from smart contract');
    }
});

// Define a cron job to run every minute
cron.schedule('* * * * *', async () => {
    try {
        // Logic to check payment completion for each pending order
        // Fetch all orders from the database
        const orders = await Order.find({});
        for (const order of orders) {
            const payment = await razorpay.payments.fetch(order.orderId);
            if (payment.status === 'captured') {
                // Hit Razorpay payout API to pay tokenProviderBankDetails
                await razorpay.payouts.create({
                    bank_account: order.tokenProviderBankDetails, // Example: { account_number: 'XXXXXXXXXX', ifsc: 'XXXXX', beneficiary_name: 'XXXXX' }
                    amount: order.fiatAmountAsked * 100, // Convert fiatAmountAsked to paise
                    currency: 'INR',
                    mode: 'IMPS', // You can adjust the mode as per your requirement
                });
                console.log(`Payment completed for order ID: ${order.orderId}`);
            }
        }
    } catch (error) {
        console.error('Error checking payment status:', error);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
