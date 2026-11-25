<table class="totals">
    <tr><td>Subtotal</td><td class="num">{{ number_format((float) $document->subtotal, 2) }}</td></tr>
    <tr><td>Item Discounts</td><td class="num">-{{ number_format((float) $document->item_discount_total, 2) }}</td></tr>
    <tr><td>Item GST</td><td class="num">+{{ number_format((float) $document->item_gst_total, 2) }}</td></tr>
    @if($isSale && (float) $document->discount_amount > 0)
        <tr><td>Invoice Discount</td><td class="num">-{{ number_format((float) $document->discount_amount, 2) }}</td></tr>
    @endif
    @if($isSale && (float) $document->gst_amount > 0)
        <tr><td>Invoice GST</td><td class="num">+{{ number_format((float) $document->gst_amount, 2) }}</td></tr>
    @endif
    @if((float) ($document->rounding_amount ?? 0) !== 0.0)
        <tr><td>Rounding</td><td class="num">{{ number_format((float) $document->rounding_amount, 2) }}</td></tr>
    @endif
    <tr class="grand"><td>Total (Rs)</td><td class="num">{{ \App\Support\MoneyDisplay::total($document->total_amount) }}</td></tr>
</table>
